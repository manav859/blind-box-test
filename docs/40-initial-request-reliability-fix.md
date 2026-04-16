# Initial Request Reliability Fix

Date: 2026-04-13

## Root Cause

The embedded admin frontend was issuing protected API requests immediately on page mount while the embedded SHOPLINE session token flow could still be initializing.

At the same time, the shared blind-box API client assumed every response body was JSON and did this:

- read the response as text
- call `JSON.parse(...)` unconditionally

When an early protected request received a non-JSON response instead of the expected API payload, the frontend crashed into a raw parse error such as:

```text
Unexpected token 'p', "parse sess"... is not valid JSON
```

The non-JSON response could come from early auth/session timing, such as:

- a text response from the auth/session layer
- an HTML redirect page
- a reauthorization flow response

There was also a header-merging weakness in the shared authenticated fetch wrapper:

- the API layer passed a `Headers` object
- the fetch wrapper spread it into a plain object
- this could silently drop request headers such as `Accept` and `Content-Type`

## What Was Changed

### 1. Embedded Session Readiness Gate

Updated:

- `web/src/hooks/useAuthenticatedFetch.ts`

The shared authenticated fetch hook now:

- detects embedded context more robustly
- probes the embedded session token before protected requests proceed
- retries early token acquisition a few times during initialization
- exposes:
  - `isReady`
  - `initializationError`
  - `retryInitialization`

### 2. Safe Reauthorization Handling

The shared authenticated fetch hook now throws a controlled frontend error after triggering SHOPLINE reauthorization, instead of returning a response that the API layer might try to parse as JSON.

### 3. Defensive Non-JSON API Parsing

Updated:

- `web/src/hooks/useBlindBoxAdminApi.ts`

The shared API client now:

- checks response content type
- only parses JSON when the response actually looks like JSON
- treats HTML/text/non-JSON responses as recoverable API errors
- returns a clean `BlindBoxApiError` message instead of a raw `JSON.parse` exception

### 4. Correct Header Forwarding

The authenticated fetch wrapper now merges headers with a real `Headers` instance instead of object-spreading a `Headers` object.

This keeps request headers like:

- `Accept: application/json`
- `Content-Type: application/json`

intact across the shared API path.

### 5. Initial Page Load Guard

Updated:

- `web/src/hooks/useResource.ts`
- `web/src/pages/blind-box/pools.tsx`
- `web/src/pages/blind-box/assignments.tsx`
- `web/src/pages/blind-box/failures.tsx`
- `web/src/pages/blind-box/pools/[blindBoxId].tsx`
- `web/src/pages/blind-box/debug.tsx`

The shared resource loader now supports an `enabled` gate.

The main admin data-loading pages now wait for `api.isReady` before firing protected requests.

Instead of racing the embedded session, they show a clean loading state such as:

- `Preparing admin session`

If session initialization fails, the UI now shows:

- a readable error message
- a `Retry Session` action

## How Initial Load Is Now Handled More Safely

On initial page load:

1. the embedded frontend creates the App Bridge client from the current URL context
2. the authenticated fetch hook attempts to obtain the session token
3. list/detail pages wait for session readiness before firing protected API requests
4. if the session is not ready yet, the user sees a loading state instead of a failed JSON parse
5. if a request still returns non-JSON, the API layer converts it into a readable recoverable error

This means:

- early redirect/text/error responses no longer produce raw JSON parse crashes
- the user sees a clean retryable state instead

## How To Test The Fix

### Local Embedded Flow

1. run the app from the repo root:

```powershell
npm run dev
```

2. open the embedded app inside SHOPLINE admin
3. land directly on:
   - `/blind-box/pools`
   - `/blind-box/assignments`
   - `/blind-box/failures`
   - `/blind-box/debug`

### Expected Result

On a cold initial load:

- the page may briefly show `Preparing admin session`
- it should then load normally
- it should not show a raw JSON parse exception

### Retry/Recovery Check

If the embedded session is delayed or temporarily unavailable:

- the page should show a readable recoverable error
- `Retry Session` should be available where relevant
- retrying should recover without a raw `Unexpected token ... is not valid JSON` crash

### Debug Page Check

Open:

```text
/blind-box/debug
```

Before readiness:

- debug action buttons remain disabled

After readiness:

- `Load Locations`
- `Load Product`
- `Load Variant Inventory`

should work through the embedded authenticated fetch flow

## Build Verification

Verified with:

- `web`: `npm run build`
- repo root: `npm run build`
