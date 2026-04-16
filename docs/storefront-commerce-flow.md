# Storefront Commerce Flow

## Goal

This document records the production storefront checkout path for the SHOPLINE Blind Box App after native commerce integration.

## Implemented Flow

1. Merchant creates a normal SHOPLINE product that represents the blind-box purchase.
2. Merchant tags that sellable product with `blind-box`.
3. Merchant maps that sold product or sold variant to a blind box in admin through `blind_box_product_mappings`.
4. Merchant configures at least one enabled, in-stock pool item for prize assignment.
5. Shopper opens the sold product by using `View in Online Store` from SHOPLINE product admin.
6. The theme app extension renders a real `POST /cart/add` form with quantity fixed to `1`.
7. The storefront block keeps the hidden variant input synced with the currently selected native SHOPLINE product variant.
8. Shopper clicks `Buy Blind Box`.
9. The sold SHOPLINE variant is added to the native cart and the shopper completes normal SHOPLINE checkout.
10. SHOPLINE emits `orders/paid`.
11. The backend detects blind-box order lines by `productId` and optional `productVariantId`.
12. Existing backend assignment and inventory services execute without any direct storefront purchase API call.

## Storefront Responsibilities

Storefront code only handles the commerce shell:

- gate the block to products tagged `blind-box` or `blind-box-active`
- render blind-box purchase messaging
- submit the real selected SHOPLINE variant to `/cart/add`
- fix quantity to `1`
- provide loading, disabled, and error states
- provide explicit editor and debug diagnostics for wrong-page, missing-tag, and theme-form incompatibility cases
- log storefront `productId`, selected `variantId`, tags, and eligibility state when debug mode is enabled

The storefront does not:

- call backend purchase APIs
- decide blind-box assignment
- mutate blind-box inventory directly
- bypass native SHOPLINE cart or checkout

## Backend Responsibilities

Backend code continues to own all blind-box business logic:

- webhook receipt and verification
- blind-box order-line identification
- idempotent assignment persistence
- prize selection
- inventory execution
- retry and failure handling

Relevant backend path:

- `app/src/controller/webhook/index.ts`
- `app/src/service/webhook/paid-order-webhook-service.ts`
- `app/src/service/blind-box/paid-order-assignment-service.ts`
- `app/src/domain/blind-box/order-detection.ts`

## Production Contract

### Storefront eligibility

Use product tag:

- `blind-box`
- `blind-box-active`

This tag is only a storefront rendering gate. It does not identify blind-box purchases for the webhook.

### Sold blind-box purchase mapping

Use:

- `blind_box_product_mappings.productId`
- `blind_box_product_mappings.productVariantId`
- `blind_box_product_mappings.blindBoxId`

This is the stable contract between sold SHOPLINE products and the blind-box domain.

### Prize execution mapping

Use:

- `blind_box_pool_items.sourceProductId`
- `blind_box_pool_items.sourceVariantId`

These fields are only for prize-side inventory execution and must remain separate from the sold-product mapping.

## Hardening Added

- Theme block now renders only on tagged blind-box products in live storefront mode.
- Theme block now shows explicit diagnostics in Theme Editor or debug mode instead of silently disappearing.
- Theme JS keeps the hidden blind-box cart form synced with native variant selection.
- Theme JS prevents duplicate initialization and works if the block is rendered multiple times.
- Quantity is fixed to `1` on the storefront add-to-cart form.
- Theme JS now supports both `blind-box` and `blind-box-active` storefront tags.
- Debug mode can be enabled with `window.__BLIND_BOX_DEBUG__ = true` followed by `window.dispatchEvent(new Event("blind_box_debug_refresh"))`.
- Backend rejects blind-box order lines with quantity greater than `1`.
- Admin save validation now checks sold product and sold variant integrity against live SHOPLINE product data.
- Activation now requires at least one enabled sold-product mapping and at least one ready pool item.
- Webhook success logging now includes assignment summaries for debugging.

## Files Modified For Commerce Integration

### Storefront extension

- `extensions/theme-app-extension/blocks/blind-box-product-shell.html`
- `extensions/theme-app-extension/assets/blind-box-product-shell.css`
- `extensions/theme-app-extension/assets/blind-box-product-shell.js`

### Admin and validation

- `web/src/components/blind-box/ProductMappingForm.tsx`
- `web/src/components/blind-box/ProductMappingsTable.tsx`
- `web/src/pages/blind-box/pools/[blindBoxId].tsx`
- `web/src/pages/blind-box/debug.tsx`
- `app/src/controller/admin/blind-box/index.ts`
- `app/src/service/blind-box/blind-box-activation-readiness-service.ts`

### Webhook and assignment hardening

- `app/src/service/blind-box/paid-order-assignment-service.ts`
- `app/src/service/webhook/paid-order-webhook-service.ts`

### Tests

- `app/src/service/blind-box/blind-box-activation-readiness-service.test.ts`
- `app/src/service/webhook/paid-order-webhook-service.test.ts`
- `app/src/test-utils/blind-box-test-context.ts`

## Verification

## Deterministic Test Flow

1. Go to SHOPLINE Admin.
2. Open the sold blind-box product.
3. Add the tag `blind-box` or `blind-box-active`.
4. Click `View in Online Store`.
5. Do not test from `/search`, the storefront home page, or a generic theme preview shell.
6. In Theme Editor, switch to the matching product template.
7. Add the app block `Blind Box Purchase (Product Page Only)` and save.
8. Reload the real product detail page and verify the CTA is visible.

## Wrong Test Surfaces

- `/search`
- home page preview
- collection preview
- generic theme preview shell without a real product detail URL

## Debug Signals

Use browser console debug mode when needed:

```js
window.__BLIND_BOX_DEBUG__ = true;
window.dispatchEvent(new Event("blind_box_debug_refresh"));
```

Expected console labels:

- `eligibility_status`
- `init`
- `variant_sync`
- `submit`
- `ineligible_page`
- `missing_tag`
- `missing_product_form`

Local verification completed:

- `cd app && npm run build`
- `cd web && npm run build`
- `cd app && npm test`

Note:

- the backend test suite needed to be rerun outside the sandbox because Windows sandbox worker spawning produced `spawn EPERM`

## Remaining Operational Dependencies

- The storefront cannot confirm admin mapping health at purchase time without calling backend services, which is intentionally avoided.
- Variant availability still depends on the live SHOPLINE product form state and publish status in the theme.
- Execute-mode readiness can still fail later if store inventory, scopes, or location config drift after activation. That is handled as a controlled backend failure, not a storefront concern.
