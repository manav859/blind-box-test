# Inventory Integration And Recovery

Date: 2026-04-13

## Purpose

This document records the next backend phase after the paid-order assignment flow:

- real inventory execution can now run through a concrete SHOPLINE integration boundary
- assignment persistence and inventory execution remain separate steps
- the assignment-to-inventory boundary is now persisted transactionally
- failed and replayed flows remain retry-safe without rerolling the assignment

This phase does **not** start theme app extension work.

## What Changed In This Phase

### 1. Assignment And Inventory Boundary Is Now Coordinated Explicitly

The backend now persists the immutable assignment row and the pending `commit` inventory operation as one coordinated boundary step.

Implementation:

- `app/src/service/inventory/assignment-inventory-boundary-service.ts`
- `app/src/repository/assignment-inventory-boundary-repository.ts`

Behavior:

- a new blind-box selection still happens first in backend memory
- the selected item is then persisted as the immutable assignment
- the pending inventory operation is created in the same DB transaction
- live inventory execution still begins only after that transaction succeeds

This closes the earlier crash window where an assignment could exist without an inventory-operation record.

### 2. Inventory Execution Remains A Separate Step

Execution still happens through:

- `app/src/service/inventory/inventory-execution-service.ts`

That service is responsible for:

- moving the inventory operation from `pending` or `failed` into `processing`
- reserving the app-managed pool-item quantity during execution
- calling the SHOPLINE inventory gateway
- marking success, failure, or indeterminate reconciliation state

The system now has a cleaner separation:

1. persist immutable assignment plus pending operation boundary
2. execute or defer the inventory mutation

### 3. Retry And Replay Behavior Is Explicit

The backend now keeps these guarantees:

- retrying inventory execution never creates a new assignment
- retrying inventory execution never creates a second inventory operation for the same assignment
- replaying the same failed webhook does not silently mark the event `processed`
- replaying the same webhook after a successful manual recovery can mark the event `processed`
- a succeeded inventory operation becomes a noop on duplicate retries

### 4. SHOPLINE Gateway Boundary Is More Explicit

The live gateway remains in:

- `app/src/integration/shopline/inventory-gateway.ts`

This phase keeps the gateway concrete instead of pretending the integration is finished when store setup is still missing.

The implemented boundary now makes these facts explicit:

- the backend calls real SHOPLINE Admin OpenAPI paths for product, variant, location, and inventory adjustment
- the gateway accepts either plain ids or `gid://shopline/...` ids for product, variant, and location inputs
- platform idempotency is **not assumed** from SHOPLINE for the mutation endpoint
- backend idempotency is enforced by the persisted assignment and inventory-operation records

## Exact Assignment-To-Inventory Flow

### Success Path

1. SHOPLINE verifies and delivers `orders/paid`.
2. The backend detects mapped blind-box line items.
3. If no assignment exists for `shop + order_id + order_line_id`, the backend selects one eligible pool item.
4. The backend persists:
   - `blind_box_assignments.status = inventory_pending`
   - `inventory_operations.operation_type = commit`
   - `inventory_operations.status = pending`
5. If runtime mode is `deferred`, processing stops here and the webhook is marked `processed`.
6. If runtime mode is `execute`, the backend starts execution:
   - pool-item quantity is reserved locally
   - assignment becomes `inventory_processing`
   - operation becomes `processing`
7. The SHOPLINE gateway adjusts inventory successfully.
8. Final success state:
   - assignment = `inventory_committed`
   - inventory operation = `succeeded`
   - webhook event = `processed`

### Definitive Failure Path

1. Assignment persistence has already succeeded.
2. Inventory execution starts.
3. The SHOPLINE gateway returns a definitive failure.
4. The backend releases the locally reserved pool-item quantity.
5. Final failure state:
   - assignment = `inventory_failed`
   - inventory operation = `failed`
   - webhook event = `failed`
6. The selected pool item does not change.

### Indeterminate Failure Path

This is the partial-success or partial-failure boundary.

Example:

- network failure after the external request may have been accepted
- timeout where the backend cannot prove whether SHOPLINE committed the mutation

Final state:

- assignment = `inventory_processing`
- inventory operation = `processing`
- webhook event = `failed`

Meaning:

- the backend will not auto-retry that operation
- the operation must be reconciled before retrying
- duplicate retries are intentionally blocked while the operation stays `processing`

## Webhook Replay Rules

### Replay After A Successful Inventory Flow

If the event is already terminally `processed` or `ignored`:

- the webhook is acknowledged as `duplicate`
- no assignment is recreated
- no inventory operation is recreated

### Replay After Inventory Failure

If the webhook event is `failed` and the inventory operation is still `failed`:

- the backend re-enters processing safely
- the same assignment is reused
- the same inventory operation is reused
- the webhook stays `failed`
- the event is **not** incorrectly upgraded to `processed`

### Replay After Manual Recovery

If manual retry already succeeded before the webhook is replayed:

- the existing assignment is reused
- the existing inventory operation is reused
- execution is a noop because the operation already succeeded
- the webhook can now transition to `processed`

## Recovery Support Added For Future Admin Operations

This phase keeps UI work minimal but adds backend support for later tooling.

Relevant endpoints already available:

- `GET /api/blind-box/inventory-operations`
- `POST /api/blind-box/inventory-operations/:operationId/retry`
- `GET /api/blind-box/webhook-events`

Relevant backend records now sufficient for a future retry page:

- immutable assignment id and selected pool item
- inventory operation status, attempt count, timestamps, reason, and metadata
- webhook event status and failure result

## What Is Truly Live Today

Live in code now:

- webhook verification
- mapping-based blind-box detection
- backend-only prize selection
- transactional assignment plus pending-operation persistence
- deferred and execute runtime modes
- manual retry execution path for failed inventory operations
- concrete SHOPLINE inventory gateway implementation
- GID normalization for source product, variant, and location ids

## What Still Depends On Store Or Platform Setup

These parts are not fake, but they still depend on the connected private-app/store environment:

- an active SHOPLINE admin access token must exist in session storage or current admin session
- pool items must be configured with valid `sourceProductId` or `sourceVariantId`
- if a product has multiple variants, `sourceVariantId` is required
- if the store has multiple active locations, `BLIND_BOX_SHOPLINE_LOCATION_ID` should be set
- the private app must have the SHOPLINE scopes required for product reads and inventory adjustment

Important current repo fact:

- `shopline.app.toml` now declares:
  - `write_products`
  - `read_products`
  - `read_inventory`
  - `read_location`
  - `write_inventory`

That means:

- the gateway code path is real
- execute mode is wired with explicit validation
- but the private app must still be reauthorized or reinstalled in the connected store so the live token actually carries the updated scopes

## How This Works In The Current Private-App Store Setup

Current recommended interpretation:

- use `deferred` mode as the safe default while validating mappings, assignment flow, and admin visibility
- enable `execute` mode only after store-side access token, scopes, source ids, and location resolution are confirmed

Runtime knobs:

- `BLIND_BOX_INVENTORY_EXECUTION_MODE=deferred|execute`
- `BLIND_BOX_SHOPLINE_LOCATION_ID=<location-id>` when needed
- `SHOPLINE_ADMIN_API_VERSION=<version>` if the store requires a different Admin OpenAPI version

## Local Test Procedure

### Backend-Only Tests

From `app/`:

```powershell
npm run build
npm test
```

Coverage now includes:

- successful execute mode
- deferred mode
- retry of failed inventory execution
- duplicate retry noop behavior
- webhook replay after failed inventory execution
- webhook replay after manual recovery
- immutable assignment preservation during retries

### Safe Local Runtime Verification

From repo root:

```powershell
npm run dev
```

Then verify:

1. the existing SHOPLINE CLI project still boots normally
2. admin auth/session flow still works
3. blind-box configuration still works from the embedded dashboard
4. assignments appear after `orders/paid`
5. inventory operations are visible through the admin API

## Connected Store Verification Procedure

### Deferred Mode

Use this first in the connected private app/store context.

1. Set `BLIND_BOX_INVENTORY_EXECUTION_MODE=deferred`.
2. Create or update a blind box, pool items, and product mapping.
3. Ensure each pool item has the intended source product or variant ids.
4. Place a paid order for a mapped blind-box product.
5. Verify:
   - assignment exists
   - assignment status is `inventory_pending`
   - inventory operation status is `pending`
   - webhook event is `processed`

### Execute Mode

Only do this after store/platform prerequisites are confirmed.

1. Confirm the private app/store setup includes usable access tokens and required scopes.
2. Configure `BLIND_BOX_INVENTORY_EXECUTION_MODE=execute`.
3. Set `BLIND_BOX_SHOPLINE_LOCATION_ID` if the store does not resolve to one active/default location.
4. Place a paid order for a mapped blind-box product.
5. Verify:
   - assignment reaches `inventory_committed`
   - inventory operation reaches `succeeded`
   - webhook event reaches `processed`
   - store inventory changed for the mapped source item

### Failure And Recovery Verification

1. Force a gateway failure or use intentionally invalid source ids.
2. Place a paid order in execute mode.
3. Verify:
   - assignment = `inventory_failed`
   - inventory operation = `failed`
   - webhook event = `failed`
4. Retry with:

```text
POST /api/blind-box/inventory-operations/:operationId/retry
```

5. After a successful retry, replay the original webhook if needed and confirm it can now settle as `processed` without creating a second assignment.

## What Still Remains Before Theme Extension Work

This phase intentionally stops before theme work.

Remaining backend and operational prerequisites:

- confirm the final SHOPLINE scopes needed for live inventory mutation in the private app/store
- validate execute mode against the connected store with real source ids and location behavior
- decide the operator workflow for indeterminate `processing` operations that require reconciliation
- optionally expose richer admin UI for webhook failures and retry actions

Only after those are validated should theme app extension work begin.
