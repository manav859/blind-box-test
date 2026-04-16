# Admin Dashboard

## Purpose

This document describes the embedded merchant admin dashboard added in `web/` for managing blind-box configuration and reviewing backend outcomes.

The dashboard is intentionally thin:

- it uses authenticated admin APIs
- it does not implement prize selection logic
- it does not implement assignment logic
- it does not alter webhook processing behavior

All business-critical blind-box logic remains in `app/`.

## Page Structure

### `/`

- redirects to `/blind-box/pools`

### `/blind-box/pools`

- blind-box list page
- shows:
  - name
  - description
  - selection strategy
  - status
  - updated timestamp
- includes CTA to create a new blind box
- each row links to the edit page

### `/blind-box/pools/new`

- create blind-box page
- form fields:
  - name
  - selection strategy
  - status
  - description
- on success:
  - creates the blind box through backend API
  - navigates to the edit page

### `/blind-box/pools/:blindBoxId`

- edit page for a single blind box
- sections:
  - basic blind-box info
  - pool item manager
  - product mappings
- supports:
  - updating name, strategy, description, status
  - adding pool items
  - editing existing pool items
  - adding product mappings
  - editing existing product mappings

### `/blind-box/assignments`

- assignment history page
- shows:
  - order id
  - order line id
  - blind box
  - assigned item
  - assignment status
  - created and updated timestamps

### `/blind-box/failures`

- failure visibility page
- currently shows:
  - failed assignments with recorded metadata
  - failed inventory operations with recorded reasons
- current limitation:
  - webhook event failures are not yet exposed by a read API

## UI Architecture

The dashboard uses a shared embedded-admin shell and reusable primitives.

### Shared Layout

- `web/src/components/admin/AdminLayout.tsx`
  - sidebar navigation
  - shared embedded app frame
  - preserves SHOPLINE query params on navigation

### Shared UI Primitives

- `PageHeader`
- `SectionCard`
- `StatePanel`
- `DataTable`
- `StatusBadge`
- `FormField` and shared form controls

These keep loading, empty, error, table, and form patterns consistent across pages.

### Blind-Box Components

- `BlindBoxForm`
- `BlindBoxesTable`
- `PoolItemForm`
- `PoolItemsTable`
- `PoolItemRow`
- `ProductMappingForm`
- `ProductMappingsTable`
- `AssignmentsTable`
- `FailureLogsTable`

### API Layer

- `web/src/hooks/useBlindBoxAdminApi.ts`
  - wraps the existing `useAuthenticatedFetch`
  - stringifies JSON bodies correctly for the current backend request parsing
  - normalizes API success/error handling

- `web/src/hooks/useResource.ts`
  - simple page-level async loading wrapper
  - supports initial load, retry, and refresh

- `web/src/hooks/useToast.ts`
  - App Bridge messages for success/error feedback

## API Mapping

### Blind Boxes

- `GET /api/blind-box/pools`
  - used by:
    - blind-box list page
    - edit page

- `POST /api/blind-box/pools`
  - used by:
    - create page

- `PUT /api/blind-box/pools/:blindBoxId`
  - used by:
    - edit page basic info form
  - added as minimal admin integration support

### Pool Items

- `GET /api/blind-box/pools/:blindBoxId/items`
  - used by:
    - edit page pool item manager
    - catalog enrichment for assignments and failures
  - added as minimal admin integration support

- `POST /api/blind-box/pools/:blindBoxId/items`
  - used by:
    - add item
    - edit existing item

### Product Mappings

- `GET /api/blind-box/product-mappings`
  - used by:
    - edit page mapping section

- `POST /api/blind-box/product-mappings`
  - used by:
    - add mapping
    - edit existing mapping

### Assignments

- `GET /api/blind-box/assignments`
  - used by:
    - assignment history
    - failure log correlation

### Inventory Operations

- `GET /api/blind-box/inventory-operations`
  - used by:
    - failure logs

## How The Dashboard Connects To Backend

1. The embedded app UI uses `useAuthenticatedFetch`.
2. `useBlindBoxAdminApi` attaches JSON headers and parses the existing backend response envelope.
3. The backend remains responsible for:
   - validation
   - blind-box persistence
   - item persistence
   - mapping persistence
   - assignment persistence
   - inventory failure recording
4. The frontend only:
   - renders state
   - submits merchant intent
   - reads operational records

## How To Test UI Locally

### 1. Start the app

Run the existing local flow:

```powershell
npm run dev
```

This should start the SHOPLINE CLI flow and serve both `app/` and `web/`.

### 2. Open the embedded app in SHOPLINE admin

Use the existing CLI app preview/install flow.

The dashboard entry route is:

```text
/blind-box/pools
```

### 3. Create a blind box

1. Open `Blind Boxes`
2. Click `Create Blind Box`
3. Enter:
   - name
   - strategy
   - optional description
   - status
4. Submit the form
5. Confirm you are redirected to the edit page

### 4. Add pool items

1. On the edit page, go to `Pool items`
2. Add one or more item rows
3. Set:
   - label
   - weight
   - inventory quantity
   - enabled flag
   - optional source product and variant ids
4. Save each item
5. Confirm the item appears in the table

### 5. Map a product

1. On the same edit page, go to `Product mappings`
2. Add the sellable store product id
3. Optionally add a variant id for variant-specific routing
4. Save the mapping
5. Confirm it appears in the mappings table

### 6. Trigger the paid-order webhook

Recommended local path:

1. In the SHOPLINE dev store, create or use the mapped product
2. Place a paid order for that mapped product or variant
3. Let SHOPLINE deliver the `orders/paid` webhook to the app

Alternative:

- replay a real `orders/paid` webhook through your SHOPLINE development tooling if available

The app does not include a separate local-only webhook bypass UI, so the clean path is a real or replayed paid-order event.

### 7. Verify assignment in UI

1. Open `Assignments`
2. Confirm a new row exists for the paid order
3. Verify:
   - order id
   - assigned item
   - assignment status
   - timestamps

### 8. Verify failure visibility

If an inventory workflow fails:

1. Open `Failure Logs`
2. Confirm the failed assignment or failed inventory operation appears
3. Verify the reason column contains recorded metadata or inventory failure reason

## Missing Backend Support

The dashboard now has the minimum API surface needed for create/list/edit flows, but a few backend read features are still missing for a fuller admin experience:

- webhook failure read endpoint
  - needed to show `webhook_events` directly in failure logs

- retry actions
  - needed for operational recovery from assignment or inventory failures

- richer product lookup
  - current mapping form accepts raw product and variant ids
  - product search or picker would require backend or SHOPLINE integration support

## Verification Performed

- `web`: `npm run build`
- `app`: `npm run build`
- `app`: `npm test`

## Next Step Recommendation

The next highest-value step is **inventory integration**.

Reason:

- the dashboard now lets merchants configure pools and inspect outcomes
- assignment and failure visibility already expose the operational boundary
- the most important remaining product risk is real inventory reservation/commit behavior

Theme/storefront extension work should follow after inventory behavior is production-safe.
