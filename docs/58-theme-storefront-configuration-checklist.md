# Theme Storefront Configuration Checklist

Use this checklist when preparing the Blind Box storefront block for real storefront testing.

## Product Checklist

- create or choose one normal SHOPLINE product that will be sold as the blind box
- publish that product to the storefront
- tag that product exactly `blind-box`
- use the product detail page, not search or home, for testing

## Blind Box Admin Checklist

- create or open the target blind box in the embedded admin
- add an enabled sold-product mapping for that product
- add `productVariantId` when the product has multiple variants
- add at least one enabled in-stock pool item
- run readiness checks if execute mode is enabled
- activate the blind box only after readiness passes

## Theme Editor Checklist

- open the target theme in SHOPLINE Theme Editor
- switch to a product detail template
- preview the exact blind-box sold product
- add the app block `Blind Box Purchase (Product Page Only)`
- place it near the product form or buy box
- save the template

## Storefront Checklist

- open the real product page URL for that blind-box product
- confirm the block renders with `Buy Blind Box`
- confirm the surrounding native product form still exists
- confirm the CTA adds the correct variant to cart
- confirm quantity stays `1`

## Debug Checklist

If the CTA is missing:

- confirm the current page is a product detail page
- confirm the product has the `blind-box` tag
- confirm the block was added to that product template in Theme Editor
- confirm browser console logs from `[BlindBoxStorefront]`
- confirm the correct product page was opened from SHOPLINE product admin or storefront product handle
