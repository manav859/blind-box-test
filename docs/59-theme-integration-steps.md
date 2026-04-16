# Theme Integration Steps

This document covers the exact steps to push the Blind Box theme app extension and test the real storefront commerce block in the connected SHOPLINE store.

## Current Extension Status

Active extension folder:

- `extensions/theme-app-extension`

Current storefront block:

- `blocks/blind-box-product-shell.html`

Current target:

- `target: section`
- `templates: ["products/detail"]`

Important:

- this is a product-detail-only app block
- it is not supposed to appear on home, search, collection, or cart templates

## Exact Command Sequence

Run these commands from PowerShell.

### 1. Go to the repo root

```powershell
cd C:\Users\manav\blindbox-test-01
```

### 2. Move into the extension directory

```powershell
cd extensions\theme-app-extension
```

### 3. Push the extension draft

```powershell
shopline extension push
```

### 4. Publish the pushed version

After `shopline extension push` succeeds:

1. Open the printed Developer Center URL.
2. Create a new extension version from the latest draft.
3. Publish that version.

## Theme Editor Test Flow

After the extension version is published:

1. Open the connected store admin.
2. Go to `Online Store`.
3. Open the target theme and click `Customize`.
4. Switch to a product detail template.
5. Open a real sold blind-box product in preview.
6. Add the app block `Blind Box Purchase (Product Page Only)`.
7. Place it near the main product form or buy box.
8. Save the template.

## Deterministic Product Test Flow

Use this exact sequence:

1. In SHOPLINE product admin, open the product that should be sold as the blind box.
2. Confirm it is tagged `blind-box` or `blind-box-active`.
3. Click `View in Online Store` from that product.
4. Use that product detail URL for storefront testing.

Do not use:

- home page preview
- search page preview
- collection page preview
- generic theme preview shell

## What To Verify

Verify the following visually:

- the block renders on the product detail page
- the CTA label is `Buy Blind Box`
- the explanatory copy says the reveal happens after purchase
- clicking the CTA adds the selected variant to native cart
- cart line item matches the sold blind-box product variant

## Debug Signals

Browser console logs use:

- `[BlindBoxStorefront]`

Useful log labels:

- `init`
- `variant_sync`
- `submit`
- `ineligible_page`
- `missing_tag`
- `missing_product_form`

## What This Phase Does Not Change

This phase does not move any blind-box business logic into the storefront.

Assignment, inventory execution, retries, and webhook processing remain backend-owned.
