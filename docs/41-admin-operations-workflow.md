# Admin Operations Workflow

This phase makes the embedded admin UI practical for connected-store execute-mode testing.

It does not move any blind-box business logic into the frontend. The backend remains the source of truth for:

- blind-box assignment selection
- assignment persistence
- inventory-operation state
- execute-mode readiness validation
- retry-safe inventory execution
- webhook processing state

## 1. Configure A Real Execute-Mode Pool Item

Open the blind box in the admin UI and use the pool-item form on the right side.

The form now exposes these execute-mode inputs clearly:

- `sourceProductId`
  Use the real SHOPLINE product id for traceability and product-level fallback resolution.
- `sourceVariantId`
  Use the exact SHOPLINE prize variant id that execute mode should decrement.

Guidance:

- `sourceVariantId` is the main execute-mode identifier.
- If the product has multiple variants, `sourceVariantId` must be set.
- The IDs are intentionally plain text and copy/paste friendly so operators can paste values directly from SHOPLINE admin or the embedded Debug page.

Recommended workflow:

1. Open `/blind-box/debug`.
2. Inspect the real product and variant in the connected store.
3. Copy the product id into `sourceProductId`.
4. Copy the exact executable variant id into `sourceVariantId`.
5. Save the pool item.

## 2. Run And Read Readiness Checks

After saving a pool item, use the pool-item readiness panel or the `Check Readiness` action in the pool-item table.

The UI now translates backend readiness results into operator-readable statuses such as:

- `Ready`
- `Missing location`
- `Missing variant`
- `Missing inventory item`
- `Untracked inventory`
- `Location linkage missing`
- `Scope / config issue`
- `Admin session required`
- `Needs review`

The readiness panel also shows:

- assignment-time identifiers
- resolved execution-time identifiers
- target location and location resolution
- tracked inventory state
- the first blocking issue and recommended fix

Use this result before execute-mode testing:

- `Ready`
  Safe to continue to a paid-order execute-mode test.
- any non-ready status
  Fix the reported store or configuration problem first. Do not assume retry will repair it.

## 3. Identify Failed Inventory Operations

Open the `Operations` page in the admin navigation.

The inventory operations section now shows, per operation:

- operation status
- operation type
- related assignment status
- order id
- assignment id
- pool item label
- source variant context
- failure reason or current state summary
- attempt count
- last update time

This gives an operator enough context to answer:

- which order failed
- which prize item was involved
- whether the operation is pending, failed, processing, or already succeeded
- whether the failure looks like a configuration issue or an execution issue

## 4. Decide Whether Retry Is Safe

The operations page exposes two backend-backed actions for pending and failed inventory operations:

- `Check Readiness`
- `Retry` or `Run Now`

Use this rule:

- retry is safe when readiness returns `Ready` and the failure was caused by a fixable store/config issue that has already been corrected
- do not retry blindly when the operation is still `processing`; that state may require reconciliation first
- do not retry unchanged scope, location, or variant-linkage failures without rechecking readiness

Examples:

- missing location id fixed:
  rerun readiness, then retry
- variant was not tracked, now tracked:
  rerun readiness, then retry
- operation still shows `processing`:
  do not keep clicking retry; reconcile first

## 5. Review Failed Webhook Events

The operations page also includes failed paid-order webhook visibility.

This section is intentionally minimal and practical. It shows:

- webhook status
- topic
- event id
- recorded failure message
- last update time

Use this section to confirm when a paid-order webhook failed because downstream assignment or inventory processing did not finish cleanly.

## 6. How This Supports Final Live-Store Validation

The admin workflow now supports the full operator loop for execute-mode testing:

1. Use the Debug page to inspect live store products, variants, and locations.
2. Paste `sourceProductId` and `sourceVariantId` into the pool-item form.
3. Save the pool item.
4. Run readiness from the pool-item screen.
5. Confirm the pool item is `Ready`.
6. Place a real paid test order for the mapped blind-box product.
7. Use `Assignments` and `Operations` to confirm assignment creation and inventory-operation outcome.
8. If inventory execution fails, inspect the reason, rerun readiness, and retry only after the issue is fixed.

## 7. Before Theme App Extension Work Begins

Theme extension work should still wait until all of the following are confirmed in the connected store:

- at least one execute-mode pool item is configured with real `sourceProductId` and `sourceVariantId`
- the pool item readiness check returns `Ready`
- `BLIND_BOX_SHOPLINE_LOCATION_ID` points to the intended active location
- a real paid-order test produces:
  - immutable assignment creation
  - inventory operation success
  - healthy webhook outcome
- operators can understand and recover a failed inventory operation from the admin UI without relying on manual debug-only workflows
