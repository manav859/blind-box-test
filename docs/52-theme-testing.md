# Theme Testing

This document covers the current production-safe storefront test surface for the Blind Box app.

## What Surface Is Actually Supported

The active theme app extension block is implemented in:

- `extensions/theme-app-extension/blocks/blind-box-product-shell.html`

Its schema target is:

- `target: section`
- `templates: ["products/detail"]`

That means it is only meant to render on:

- product detail pages

It is not meant to render on:

- home page
- search page
- collection page
- cart page
- generic theme shell previews

## Required Preconditions

Before expecting the storefront CTA to appear:

1. Push and publish the theme app extension.
2. Open Theme Editor on a product detail template.
3. Add the app block named `Blind Box Purchase (Product Page Only)`.
4. Save the template.
5. Test with a real product tagged exactly `blind-box` or `blind-box-active`.
6. Ensure the sold product or variant is mapped in the Blind Box admin.

## What To Test Now

Operators can now test:

- product-page block rendering
- blind-box tag gating
- native add-to-cart form rendering
- selected variant syncing into the blind-box CTA
- quantity locked to `1`
- storefront loading and disabled states
- responsive layout on desktop and mobile product pages

## What The Block Does Not Do

The storefront block still does not:

- choose a prize on the frontend
- call backend purchase APIs
- bypass native SHOPLINE checkout
- show post-purchase assignment results directly on the product page

Those behaviors remain backend-owned.

## Safe Validation Checklist

Confirm the following:

- the block appears in Theme Editor only on a product detail template
- the tested product has the `blind-box` tag
- the block renders on that product page
- the CTA label is `Buy Blind Box`
- clicking the CTA posts the selected variant to `/cart/add`
- the cart line shows the expected sold blind-box product variant

## Debug Signals

The storefront JS now logs useful warnings:

- `ineligible_page`
  usually means the current product is missing the `blind-box` tag or the wrong page is being tested
- `missing_tag`
  means the current product page is live but the required storefront activation tag is missing
- `missing_product_form`
  means the block could not find the surrounding product form structure it expects

Browser console logs are prefixed with:

- `[BlindBoxStorefront]`
