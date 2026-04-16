# Debug Endpoints For Live-Store Validation

Date: 2026-04-13

## Purpose

This document describes the temporary but authenticated backend debug endpoints added for the fastest safe execute-mode validation path in the connected private SHOPLINE store.

These endpoints are:

- admin-authenticated only
- read-only
- diagnostic-focused
- aligned with the same SHOPLINE Admin API boundary the inventory execution path already uses

They do not mutate inventory and they do not change blind-box assignment logic.

## Available Endpoints

### 1. List Locations

```text
GET /api/blind-box/debug/locations
```

Returns:

- `id`
- `name`
- `active`
- `isDefault`

Use this first to confirm the location id you want to place in `BLIND_BOX_SHOPLINE_LOCATION_ID`.

### 2. Inspect Product And Variants

```text
GET /api/blind-box/debug/products/:productId
```

Returns:

- `productId`
- `normalizedProductId`
- `title`
- `variants[]`

Each variant includes:

- `variantId`
- `title`
- `sku`
- `inventoryItemId`
- `inventoryQuantity`
- `tracked`

Use this to confirm which real variant id should be stored on the blind-box pool item as `sourceVariantId`.

### 3. Inspect Variant Inventory

```text
GET /api/blind-box/debug/variants/:variantId/inventory
```

Returns:

- `variantId`
- `inventoryItemId`
- `tracked`
- `requiredShipping`
- `sku`
- `configuredLocationId`
- `executionLocationId`
- `executionLocationResolution`
- `linkedLocationIds`
- `inventoryLevels[]`
- `issues[]`

Use this to confirm whether a specific variant is actually executable in the connected store at the current execute-mode location.

## How To Call These Endpoints

These routes are behind the existing SHOPLINE authenticated admin session. The fastest path is:

1. run the app with `npm run dev`
2. open the embedded app inside the connected SHOPLINE admin
3. use the browser devtools console on the app page
4. call the endpoint with relative `fetch(...)`

Example:

```js
await fetch('/api/blind-box/debug/locations').then((r) => r.json())
```

```js
await fetch('/api/blind-box/debug/products/123456789').then((r) => r.json())
```

```js
await fetch('/api/blind-box/debug/variants/987654321/inventory').then((r) => r.json())
```

If you need to use GIDs instead of plain ids, URL-encode them first because the route uses a path parameter.

## How To Find A Valid Location Id

Use:

```text
GET /api/blind-box/debug/locations
```

Then:

1. choose the location that should own blind-box inventory execution
2. copy its `id`
3. set `BLIND_BOX_SHOPLINE_LOCATION_ID` to that value
4. restart the backend if required by your local runtime flow

If the store has multiple active locations, do not guess. Set the location explicitly.

## How To Find A Valid Product Id And Variant Id

Fastest safe path:

1. copy a real product id from SHOPLINE admin or an existing store mapping you already know
2. call:

```text
GET /api/blind-box/debug/products/:productId
```

3. inspect `variants[]`
4. choose the exact variant to use for execute mode
5. copy its `variantId`

The product debug endpoint is the preferred source for the variant id because it shows the variant and its exposed inventory linkage fields in one response.

## How To Use These Values With The Existing Blind-Box Mapping Flow

There are two separate mappings in this backend:

### Storefront Purchase Mapping

Use the existing blind-box product mapping flow so the paid-order webhook knows which storefront product triggers blind-box assignment:

- `POST /api/blind-box/product-mappings`

Fields:

- `blindBoxId`
- `productId`
- optional `productVariantId`

### Prize Inventory Mapping

Use the existing pool-item upsert flow to place the real inventory-backed source ids on the selected prize:

- `POST /api/blind-box/pools/:blindBoxId/items`

Fields for the target prize item:

- `sourceProductId`
- `sourceVariantId`

For execute mode, prefer setting `sourceVariantId` directly.

## How To Confirm A Pool Item Is Ready For Execute Mode

After setting:

- `BLIND_BOX_SHOPLINE_LOCATION_ID`
- pool item `sourceVariantId` or `sourceProductId`

run:

```text
GET /api/blind-box/pool-items/:poolItemId/execution-readiness
```

Ready means:

- `status` is `ready`
- `missingScopes` is empty
- `identifiers.inventoryItemId` is present
- `identifiers.locationId` is present
- `inventoryItem.tracked` is `true`
- `inventoryLevel.locationId` matches the execute-mode location

If readiness is not ready, use:

- `GET /api/blind-box/debug/locations`
- `GET /api/blind-box/debug/products/:productId`
- `GET /api/blind-box/debug/variants/:variantId/inventory`

to determine whether the problem is:

- wrong location id
- wrong product or variant id
- missing inventory item linkage
- inventory tracking disabled
- inventory item not linked to the target location

## Recommended Validation Sequence In The Private Store

1. Open the embedded app in the connected private store.
2. Call `GET /api/blind-box/debug/locations`.
3. Set `BLIND_BOX_SHOPLINE_LOCATION_ID` from the returned active location id.
4. Call `GET /api/blind-box/debug/products/:productId` for the real prize product.
5. Choose the exact `variantId` you want to decrement in execute mode.
6. Call `GET /api/blind-box/debug/variants/:variantId/inventory`.
7. Confirm the variant resolves to an `inventoryItemId`, is tracked, and is linked to the execute-mode location.
8. Save `sourceVariantId` on the pool item.
9. Run `GET /api/blind-box/pool-items/:poolItemId/execution-readiness`.
10. Only then test a real paid order with execute mode enabled.
