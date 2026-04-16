# Debug Page Usage

Date: 2026-04-13

## Purpose

This page gives the embedded admin app a safe way to call the live-store debug endpoints through the existing authenticated fetch flow.

It avoids the auth redirect problems that happen when the same endpoints are called from plain browser `fetch(...)` in devtools.

The page is diagnostic-only.

It does not change blind-box assignment logic and it does not mutate inventory.

## Page Route

Open:

```text
/blind-box/debug
```

In the embedded app this appears as the `Debug` item in the left admin navigation.

## What The Page Does

The page has three actions:

- `Load Locations`
- `Load Product`
- `Load Variant Inventory`

Each action uses the existing authenticated frontend API flow, so the request carries the embedded app session token instead of relying on plain browser fetch.

Each section shows:

- loading state
- error state
- formatted JSON response panel

## How To Load Locations

1. Open the `Debug` page in the embedded app.
2. Click `Load Locations`.
3. Review the JSON output.

What to look for:

- `id`
- `name`
- `active`
- `isDefault`

Use the correct active location id for:

- `BLIND_BOX_SHOPLINE_LOCATION_ID`

If the store has multiple active locations, do not guess. Pick the real location you want blind-box execute mode to decrement against.

## How To Inspect A Product

1. Enter a real SHOPLINE `productId`.
2. Click `Load Product`.
3. Review the returned `variants` array.

What to look for in each variant:

- `variantId`
- `title`
- `sku`
- `inventoryItemId`
- `inventoryQuantity`
- `tracked`

Use this step to identify the exact variant you want to map as the prize source item.

For execute mode, prefer storing:

- `sourceVariantId`

on the blind-box pool item, rather than relying only on `sourceProductId`.

## How To Inspect A Variant Inventory Record

1. Enter the exact `variantId` you want to use.
2. Click `Load Variant Inventory`.
3. Review the JSON output.

What to confirm:

- `inventoryItemId` exists
- `tracked` is `true`
- `executionLocationId` is the location you expect
- `linkedLocationIds` contains that location
- `inventoryLevels` includes that location
- `issues` is empty, or at least contains no blocking setup problem

If `issues` contains a location or linkage error, do not proceed to execute-mode order testing yet.

## How To Use This Page With Existing Blind-Box Mapping

This page helps you collect the real store ids you need for the existing backend mapping flow.

Use it in this order:

1. Load locations and choose the real execute-mode location id.
2. Set `BLIND_BOX_SHOPLINE_LOCATION_ID`.
3. Load the real prize product.
4. Copy the correct `variantId`.
5. Load variant inventory for that `variantId`.
6. Confirm tracked inventory and location linkage.
7. Save that `variantId` onto the relevant pool item as `sourceVariantId`.
8. Run the existing readiness check for the pool item.

## How This Continues Execute-Mode Testing

After the debug page confirms the store ids:

1. update the target pool item with the validated `sourceVariantId`
2. confirm the configured location id is correct
3. run:

```text
GET /api/blind-box/pool-items/:poolItemId/execution-readiness
```

4. require `status = ready`
5. only then place a real paid order with execute mode enabled

The debug page is the fastest safe path to get from:

- "I have a store product but not a clean sourceVariantId / location pairing"

to:

- "I know this pool item is mapped to a real inventory-backed variant that can be executed in the connected store"
