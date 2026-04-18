# Backend Current-State Audit

Date: 2026-04-16

## What Exists Now

The backend already had:

- verified SHOPLINE webhook handling in `app/src/controller/webhook/index.ts`
- idempotent order-line assignment persistence in `blind_box_assignments`
- inventory operation state and retry handling in `inventory_operations`
- execute-mode readiness and live inventory gateway integration
- embedded admin pages for blind boxes, assignments, failures, and debug tools

## What Remains Valid

- server-side webhook verification and topic routing
- webhook event deduplication and replay handling
- immutable assignment per `shop + order_id + order_line_id`
- inventory execution state machine and retry flows
- SHOPLINE admin access token lookup
- debug endpoints for product, variant inventory, and locations

## What Was Refactored

- `blind_boxes` are now local blind-box product references, not backend-owned catalog products
- reward membership moved from manual pool-item authority to SHOPLINE collection authority
- paid-order reward resolution now supports collection-linked candidate selection
- assignments and inventory operations now persist reward product snapshots
- admin configuration moved toward product reference + reward collection linking

## What Is Deprecated

- manual `blind_box_pool_items` as the primary reward source
- `blind_box_product_mappings` as the long-term blind-box product source of truth
- sample product creation route `/api/products/create`

## What Is Kept For Migration Safety

- legacy pool-item tables and services still exist
- legacy sold-product mappings still exist
- readiness and paid-order services retain a legacy fallback path for blind boxes that have not been migrated yet

## Code Classification

### A. Keep

- `app/src/service/webhook/*`
- `app/src/service/inventory/*`
- `app/src/repository/assignment-inventory-boundary-repository.ts`
- `app/src/integration/shopline/inventory-gateway.ts`

### B. Refactor

- `app/src/service/blind-box/paid-order-assignment-service.ts`
- `app/src/service/blind-box/blind-box-activation-readiness-service.ts`
- `app/src/controller/admin/blind-box/index.ts`
- `web/src/pages/blind-box/pools/*`

### C. Deprecate

- `blind_box_pool_items`
- `blind_box_product_mappings`
- old admin copy that described blind boxes as backend-owned pools

### D. Delete If Safe

- `app/src/controller/product/create.ts`
- `app/src/service/product/create.ts`
