# Assignment Flow

## Purpose Of This Document

This document explains the exact end-to-end backend flow from a verified paid-order webhook to a persisted blind-box assignment.

## End-To-End Flow

### Step 1. SHOPLINE sends `orders/paid`

The app receives the paid-order webhook at:

- `POST /api/webhooks`

The existing SHOPLINE webhook verification remains the first gate.

### Step 2. The webhook controller routes to the paid-order webhook service

The controller does not implement business logic.

It only:

- verifies the webhook through SHOPLINE
- extracts topic, shop, and payload
- hands `orders/paid` to the dedicated service layer

### Step 3. The webhook service establishes event identity

The service builds an event ID from:

1. `X-Shopline-Webhook-Id` when present
2. other request IDs when present
3. a deterministic fallback fingerprint if needed

This event ID is stored in `webhook_events`.

### Step 4. Event-level duplicate handling runs first

The event record is checked before order processing starts.

Rules:

- if the event is already `processed`, it is acknowledged as a duplicate
- if the event is already `ignored`, it is acknowledged as a duplicate
- if the event previously failed, it can be processed again safely because order-line assignment is idempotent

This prevents duplicate successful deliveries from rerunning selection.

### Step 5. Blind-box order detection runs

The paid-order payload is inspected line by line.

A line is treated as a blind-box purchase only if:

- it matches an enabled `blind_box_product_mapping`

Matching precedence:

1. exact product + variant mapping
2. generic product mapping with no variant

Possible line-level outcomes:

- `BLIND_BOX_MATCH`
- `NO_MAPPING`
- `MAPPING_DISABLED`
- `MISSING_PRODUCT_ID`
- `MISSING_LINE_ITEM_ID`

If no line matches a blind-box mapping, the webhook event is marked `ignored`.

## Assignment Orchestration

### Step 6. The service checks order-line idempotency

For each matched line, the service uses:

- `shop + order_id + order_line_id`

as the stable business identity.

The assignment idempotency key is stored as:

- `shop:orderId:orderLineId`

If an assignment already exists for that order line:

- the existing assignment is returned
- selection is not rerun
- the selected item remains immutable

### Step 7. The service loads the blind box and pool items

The service loads:

- the mapped blind box
- all pool items for that blind box

Current required conditions:

- blind box must exist
- blind box must be `active`
- pool must not be empty

### Step 8. Eligibility filtering runs in the backend

Current eligible item rules:

- `enabled = true`
- `inventoryQuantity > 0`

Current assumption:

- inventory availability is app-managed using persisted pool-item quantities
- live SHOPLINE inventory reads are not yet wired in this phase

### Step 9. Selection runs in the backend only

The service chooses a prize using the blind box’s configured strategy.

Supported:

- `uniform`
- `weighted`

Weighted safety rules:

- every eligible item must have a positive weight
- invalid or zero-weight eligible items fail the selection safely

### Step 10. The immutable assignment is persisted

Once a valid item is selected:

- a `blind_box_assignments` record is created
- the selected pool item ID is stored permanently for that order line

If another process races and creates the same assignment first:

- the existing assignment is loaded and returned
- no reroll happens

This is the core immutability guarantee for the current phase.

## Inventory Workflow Boundary

### Step 11. Inventory operation is recorded after assignment

After assignment persistence succeeds:

- an `inventory_operations` record is created for the selected item

Current default runtime mode:

- `deferred`

Meaning:

- the workflow boundary is recorded
- the operation remains `pending`
- the assignment remains `inventory_pending`

This is intentional until live inventory integration is connected.

### Step 12. Inventory failure handling

If inventory execution mode is switched to `execute` and the gateway fails:

- the assignment is updated to `inventory_failed`
- the inventory operation is updated to `failed`
- the webhook event is marked `failed`
- the selected item does not change

This preserves the assignment even when downstream inventory work fails.

## Failure Cases

This phase records explicit failure reasons for:

- mapped blind box missing or inactive
- empty pool
- no eligible items
- invalid weighting
- duplicate already-processed webhook event
- inventory workflow failure

Where those reasons are preserved:

- `webhook_events.error_message`
- `blind_box_assignments.metadata` for assignment-level inventory failures
- `inventory_operations.reason`
- structured logs

## What Is Real Today

- paid-order webhook verification and routing
- event persistence
- mapping-based blind-box detection
- backend-only eligibility filtering
- backend-only uniform and weighted selection
- immutable assignment persistence
- inventory workflow record creation
- duplicate event and duplicate assignment protection

## What Is Still A Placeholder

- live SHOPLINE inventory mutation
- live order enrichment through SHOPLINE gateways
- manual retry tooling
- dashboard visibility and recovery UI

## Current Testing Coverage

Current backend tests cover:

- blind-box order detection
- uniform selection
- weighted selection
- out-of-stock filtering
- duplicate paid-order webhook handling
- immutable assignment behavior across repeated processing
- no-eligible-item failure
- inventory workflow failure recording

## Important Current Assumptions

- one blind-box assignment is created per matched order line, not per quantity unit inside the line
- pool-item inventory eligibility currently uses the app’s own persisted quantity field
- product mapping is the explicit indicator that an order line should be treated as a blind-box purchase

These assumptions should be revisited in the next backend phase as the live store model and inventory integration are finalized.
