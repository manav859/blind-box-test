# Embedded Navigation Fix

This fix removes cross-origin browser-frame navigation from the embedded SHOPLINE admin app frontend.

## Root Cause

The app runs inside the SHOPLINE admin iframe.

Direct browser navigation like:

- `window.top.location.assign(...)`
- `window.location.assign(...)`
- direct access to parent or top frame location objects

is unsafe in an embedded app because the parent SHOPLINE admin frame is cross-origin.

When the frontend tried to reauthorize or exit the iframe using direct frame access, the browser blocked it with errors like:

- `Failed to read a named property 'assign' from 'Location'`
- `Blocked a frame with origin ... from accessing a cross-origin frame`

## What Was Replaced

The frontend was searched for:

- `window.location`
- `window.top`
- `window.parent`
- `location.assign`
- direct redirect logic

The actual embedded-navigation offenders were:

- reauthorization fallback in `useAuthenticatedFetch`
- `Exit-iframe` page logic

These were replaced with SHOPLINE App Bridge `Redirect`.

Additional cleanup:

- URL parsing that depended on `window.location` now uses a shared embedded URL helper based on the current document URL
- embedded auth/session redirect paths now route through App Bridge instead of browser-frame navigation

## Safe Navigation Model Now

There are now two navigation modes in the frontend:

1. In-app admin page navigation

This continues to use the existing embedded routing helper and React Router for routes such as:

- `/blind-box/pools`
- `/blind-box/assignments`
- `/blind-box/failures`
- `/blind-box/debug`

This is safe because it stays inside the app iframe and preserves embedded query context.

2. Top-level or auth-sensitive redirects

These now use SHOPLINE App Bridge `Redirect` for:

- session reauthorization
- iframe exit redirects

This is safe because App Bridge asks the host admin shell to perform the navigation instead of trying to mutate cross-origin frame location directly.

## Defensive Handling

When session expiry or reauthorization is detected:

- the frontend no longer tries to call `window.top.location.assign(...)`
- it now uses App Bridge redirect
- the user gets a clean auth-refresh flow that stays compatible with embedded admin behavior

## How To Test Inside SHOPLINE Admin

1. Start the app normally from the repo root with `npm run dev`.
2. Open the embedded app inside SHOPLINE admin.
3. Navigate across normal admin pages:
   - Blind Boxes
   - Assignments
   - Operations
   - Debug
4. Confirm there are no console errors related to:
   - cross-origin frame access
   - `Location.assign`
   - blocked frame navigation
5. Trigger a protected API request after session expiry or forced reauthorization and confirm:
   - the app uses SHOPLINE auth redirect behavior
   - no raw cross-origin navigation exception appears
6. If the auth flow uses `/exit-iframe`, confirm it redirects cleanly without browser security errors.

## Regression Guard

After this fix, `web/` no longer contains:

- `window.top`
- `window.parent`
- `location.assign`
- direct frame-location mutation logic

Future frontend auth or redirect changes should continue using App Bridge redirect utilities instead of browser-frame navigation.
