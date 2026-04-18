# Target Backend Architecture

## Source Of Truth

SHOPLINE admin now owns:

- blind-box product creation
- reward product catalog
- collection membership
- merchandising

The blind-box backend now owns:

- auto-detected blind-box cache records
- reward-group records backed by SHOPLINE collections
- blind-box product to reward-group links
- paid-order webhook orchestration
- reward candidate resolution
- random reward assignment
- assignment persistence
- inventory execution and retries
- diagnostics and readiness checks

## High-Level Model

1. Merchant creates a normal SHOPLINE product to sell as the blind box.
2. Merchant creates a SHOPLINE collection for the reward pool.
3. Merchant tags the blind-box product in SHOPLINE with `blind-box`.
4. Embedded admin links the detected product to the reward collection when needed.
5. Native SHOPLINE storefront/cart/checkout handles the purchase flow.
6. `orders/paid` hits the backend.
7. Backend auto-detects the blind-box product from SHOPLINE product data and auto-hydrates a cache record if needed.
8. Backend fetches reward candidates from the linked collection.
9. Backend selects one eligible reward.
10. Backend persists the assignment idempotently.
11. Backend runs inventory and operational side effects.

## Intentional Non-Goals

- no product catalog CRUD in the app admin
- no blind-box product registration in the app admin
- no customer-facing custom frontend requirement
- no client-side reward assignment
- no manual reward membership CRUD as authoritative data
