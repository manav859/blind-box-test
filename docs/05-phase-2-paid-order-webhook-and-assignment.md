# Phase 2 Paid-Order Webhook And Assignment

## Purpose Of This Document

This document records the backend logic added on top of the Phase 1 foundation:

- paid-order webhook handling
- blind-box order detection
- eligibility evaluation
- backend-only selection
- idempotent assignment orchestration
- inventory workflow tracking

This phase still does not build admin dashboard pages or theme/storefront integration.

## Paid-Order Webhook Topic

The backend now handles the SHOPLINE paid-order webhook topic:

- `orders/paid`

Implementation note:

- `app/src/shopline.ts` now registers `orders/paid` to the existing `/api/webhooks` callback path
- `app/src/controller/webhook/index.ts` keeps SHOPLINE webhook verification intact and routes `orders/paid` into the new webhook service layer

## What Was Added In This Phase

### Domain helpers

Added:

- `app/src/domain/blind-box/order-paid.ts`
- `app/src/domain/blind-box/order-detection.ts`
- `app/src/domain/blind-box/selection.ts`

Purpose:

- represent the paid-order payload shape used by this app
- detect which order lines are blind-box purchases based on stored product mappings
- evaluate eligible pool items
- run uniform or weighted selection entirely in the backend

### Webhook orchestration service

Added:

- `app/src/service/webhook/paid-order-webhook-service.ts`

Purpose:

- centralize `orders/paid` orchestration away from controllers
- record or reuse the webhook event record
- enforce event-level duplicate handling
- invoke the paid-order assignment service
- mark the webhook event as processed, ignored, duplicate, or failed

### Paid-order assignment service

Added:

- `app/src/service/blind-box/paid-order-assignment-service.ts`

Purpose:

- process a paid order after webhook verification
- detect blind-box lines
- enforce order-line idempotency
- select a pool item on the backend
- persist the assignment
- create and track the inventory operation boundary

### Repository and service expansions

Expanded:

- assignment repository now supports lookup by ID and status updates
- inventory operation repository now supports lookup by assignment and richer status updates
- webhook event service now supports `processing` state

### Tests

Added tests for:

- blind-box order detection
- uniform selection
- weighted selection
- out-of-stock filtering
- duplicate webhook handling
- immutable assignment behavior
- no-eligible-item failure
- inventory workflow failure recording

## End-To-End Behavior Added In This Phase

### 1. Webhook verification

The existing webhook entrypoint still uses SHOPLINE verification before any business logic runs.

### 2. Event recording and duplicate handling

The webhook service records the event in `webhook_events` using:

- the explicit SHOPLINE webhook ID header when available
- otherwise a deterministic fingerprint fallback

Terminal duplicate behavior:

- if the same event has already been marked `processed` or `ignored`, the webhook service acknowledges it as `duplicate` and does not rerun selection

Retry behavior for previously failed events:

- failed events are not treated as terminal duplicates
- the service can re-enter processing safely because order-line assignment remains idempotent

### 3. Blind-box order detection

Blind-box detection is explicit and mapping-driven.

An order line is treated as a blind-box purchase only when:

- a matching `blind_box_product_mapping` exists for the line item product
- the mapping is enabled

Mapping precedence:

1. exact product + variant mapping
2. generic product mapping with no variant

Disabled variant-specific mappings do not silently fall back to a generic mapping.

### 4. Eligibility evaluation

After a mapping is found, the service loads:

- the mapped blind box
- its pool items

The current backend eligibility rules are:

- blind box must exist and be `active`
- pool item must be `enabled`
- pool item must have `inventoryQuantity > 0`

Current stock assumption:

- inventory eligibility currently uses the app’s own persisted `inventoryQuantity` on `blind_box_pool_items`
- live SHOPLINE inventory reads are still behind a gateway boundary and are not yet connected in this phase

### 5. Selection

Selection happens only in backend code.

Supported strategies:

- `uniform`
- `weighted`

Current behavior:

- uniform selection picks one eligible item by index from backend RNG
- weighted selection requires every eligible item to have a positive weight
- zero-weight or invalid weighted candidates fail safely

### 6. Assignment persistence

The backend persists one assignment per:

- `shop + order_id + order_line_id`

The stable idempotency key is:

- `shop:orderId:orderLineId`

Behavior:

- if an assignment already exists for that order line, the service returns the existing assignment and does not reroll
- if no assignment exists, the service persists one immutable selected item for that line

### 7. Inventory workflow boundary

After assignment persistence succeeds, the backend creates an `inventory_operations` record tied to the assignment.

Current default runtime behavior:

- inventory execution mode is `deferred`
- the inventory operation is recorded with `pending` status
- the assignment remains `inventory_pending`

This preserves the workflow boundary without pretending that live inventory mutation is already wired.

### 8. Failure logging and audit trail

This phase records clear failure reasons for:

- missing or inactive blind box
- empty pool
- no eligible items
- invalid weighting
- duplicate terminal webhook event
- inventory workflow failure

Operational trail now exists in:

- `webhook_events`
- `blind_box_assignments`
- `inventory_operations`
- structured backend logs

## Real Versus Placeholder Components

### Real in this phase

- verified `orders/paid` webhook handling
- product-mapping based blind-box detection
- pool-item eligibility filtering
- uniform selection
- weighted selection
- idempotent assignment persistence
- inventory operation creation and tracking
- duplicate event handling
- backend tests

### Placeholder or deferred in this phase

- live SHOPLINE inventory mutation
- live order/inventory gateway integration
- final assignment retry workflows
- admin dashboard UI
- storefront/theme extension integration

## What Can Be Tested Now

### Safe local tests

Backend compile check:

```powershell
.\node_modules\.bin\tsc.cmd -p app\tsconfig.json --noEmit
```

Backend automated tests:

```powershell
npm test
```

From `app/`, this now runs the new TypeScript backend tests.

### Safe app-level verification in the private app setup

After running the existing root dev flow:

```powershell
npm run dev
```

You can safely verify:

- the app still boots through the existing SHOPLINE CLI flow
- the backend still authenticates the embedded app the same way
- the blind-box domain DB is created separately from session storage
- foundation APIs still work under `/api/blind-box`

Webhook logic can be verified by delivering a valid `orders/paid` webhook payload that contains a mapped product.

## Next Backend Step

The next backend step after this phase is:

- connect the inventory workflow to the real SHOPLINE inventory integration
- refine paid-order topic handling around the exact order payload fields used by the store
- add operational recovery and retry controls for failed inventory workflows
- expose assignment and failure visibility through the future admin dashboard
