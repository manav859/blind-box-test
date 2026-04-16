# Blind-Box Product Variant Mapping

## Purpose

This document defines the production-safe mapping contract between:

- the sold SHOPLINE product or variant a customer buys
- the blind-box configuration in the app
- the prize-side product or variant used for inventory execution

These are separate concerns and must not be merged.

## Two Identifier Planes

### 1. Sold blind-box purchase identifiers

These identify the storefront product that a customer buys through native SHOPLINE cart and checkout.

Source:

- table `blind_box_product_mappings`

Fields:

- `blindBoxId`
- `productId`
- `productVariantId`
- `enabled`

Use cases:

- theme block eligibility after merchant setup
- paid-order webhook blind-box line detection
- storefront commerce QA

### 2. Prize execution identifiers

These identify the actual inventory-backed variant that the blind-box assignment will decrement after payment.

Source:

- table `blind_box_pool_items`

Fields:

- `blindBoxId`
- `sourceProductId`
- `sourceVariantId`
- `enabled`
- `inventoryQuantity`

Use cases:

- pool readiness validation
- assignment execution
- inventory commit or retry flows

## Required Merchant Setup

For a blind box to be sellable in production:

1. Create a normal SHOPLINE product and publish it.
2. Tag that product with `blind-box`.
3. Add a sold-product mapping in admin using the same `productId`.
4. Add `productVariantId` when the product has multiple variants.
5. Configure at least one enabled, ready prize pool item with valid `sourceVariantId`.
6. Activate the blind box only after readiness passes.

## Validation Rules Implemented

### Admin sold-product mapping validation

When merchants save a sold-product mapping:

- the backend fetches the referenced SHOPLINE product
- if the sold product has multiple variants and `productVariantId` is omitted, the save is rejected
- if a supplied `productVariantId` does not belong to the referenced product, the save is rejected

Relevant file:

- `app/src/controller/admin/blind-box/index.ts`

### Activation validation

Before a blind box can move to `active`:

- at least one enabled sold-product mapping must exist
- at least one enabled in-stock pool item must exist
- in execute mode, at least one pool item must pass live readiness validation

Relevant file:

- `app/src/service/blind-box/blind-box-activation-readiness-service.ts`

## Theme Contract

The storefront block uses the current product page context only.

Rules:

- render only on products tagged `blind-box`
- submit the selected native SHOPLINE variant id to `/cart/add`
- do not call the backend directly from the theme

Important:

- the theme tag gate is not the source of truth for blind-box identification
- the paid-order webhook still depends on `blind_box_product_mappings`

## Why Product Title Matching Is Not Allowed

Product title matching is not stable enough for production because titles can change, be duplicated, or be localized.

The implemented system uses stable identifiers instead:

- `productId`
- `productVariantId`
- `orderId`
- `orderLineId`

## Operator Guidance

Use admin pages for different purposes:

- Blind box edit page: configure sold-product mappings and pool items
- Debug page: inspect real SHOPLINE product ids, variant ids, and inventory linkage
- Assignments and failures pages: verify post-checkout execution

## Files Involved

- `web/src/components/blind-box/ProductMappingForm.tsx`
- `web/src/components/blind-box/ProductMappingsTable.tsx`
- `web/src/pages/blind-box/pools/[blindBoxId].tsx`
- `web/src/pages/blind-box/debug.tsx`
- `app/src/controller/admin/blind-box/index.ts`
- `app/src/domain/blind-box/order-detection.ts`
