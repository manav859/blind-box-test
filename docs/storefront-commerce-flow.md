# Storefront Commerce Flow

## Final Production Flow

1. Merchant creates reward products in SHOPLINE admin.
2. Merchant adds those reward products to a SHOPLINE collection.
3. Merchant creates the sold blind-box product in SHOPLINE admin.
4. Merchant tags the sold product with:
   - `blind-box`
   - `blind-box-collection:<collection_handle>`
5. The uploaded theme renders the real SHOPLINE product page, collection pages, cart, and checkout flow.
6. Customer buys the blind-box product through the native SHOPLINE storefront.
7. SHOPLINE emits `orders/paid`.
8. The backend detects the blind-box product from SHOPLINE product tags.
9. The backend resolves the reward collection by handle.
10. The backend filters eligible candidates, persists the assignment idempotently, and validates inventory in execute mode.

## Storefront Responsibilities

The storefront only does presentation and native commerce:

- render real SHOPLINE products and collections
- show a short blind-box note on tagged products
- submit the selected variant to the native cart
- keep blind-box quantity at one per order line so the paid-order webhook receives a supported purchase shape
- keep checkout fully native

The storefront does not:

- fetch blind-box product data from the backend
- configure reward pools
- assign rewards
- execute inventory mutations

## Backend Responsibilities

The backend only does logic:

- webhook verification and ingestion
- tag-based blind-box detection
- collection lookup by handle
- reward candidate filtering
- idempotent assignment persistence
- inventory validation and execution

## Verification Checklist

- blind-box product is active and published to Online Store
- blind-box product has `blind-box`
- blind-box product has `blind-box-collection:<collection_handle>`
- reward collection exists
- reward collection has active published products
- blind-box sold product is not in its own reward collection
- execute-mode reward variants are tracked, location-linked, and in stock
- paid webhook processes one assignment per order line even if replayed
