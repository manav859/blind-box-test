# Storefront Preview Debug

## Root Cause

The active Blind Box storefront extension is a product-detail-only app block.

File-level evidence:

- `extensions/theme-app-extension/blocks/blind-box-product-shell.html`
- schema contains `templates: ["products/detail"]`

Therefore:

- a home page preview cannot show this block
- a search page preview cannot show this block
- a generic theme shell preview cannot show this block

If the preview you are looking at is not a real product detail page, it is the wrong test surface.

## Secondary Visibility Gates

Even on a product detail page, the live storefront CTA is gated by product tags.

File-level evidence:

- `data-product-tags="{{ product.tags }}"`
- `extensions/theme-app-extension/assets/blind-box-product-shell.js`
- `extensions/theme-app-extension/assets/blind-box-product-shell.css`

Required tag:

- `blind-box`
- `blind-box-active`

If that tag is missing, the live storefront block does not render the CTA. In Theme Editor or debug mode it now shows an explicit setup message instead of silently failing.

## Theme Editor Requirement

The app block is not auto-inserted. It must be added in Theme Editor to the product detail template.

Expected block name in Theme Editor:

- `Blind Box Purchase (Product Page Only)`

## Correct Test URL

The correct test URL is:

- the real product detail URL of the sold blind-box product

Best way to get it:

1. Open the product in SHOPLINE admin.
2. Confirm the tag is `blind-box`.
3. If needed, use `blind-box-active` as the alternate storefront activation tag.
4. Click `View in Online Store`.

That URL is the correct storefront preview surface.

## Wrong URLs

These are wrong for testing this block:

- storefront home page
- search results page
- collection page
- a generic uploaded theme shell not opened on a product detail route
- `/search`
- generic theme preview URL without a product handle

## If Nothing Is Visible

Check in this order:

1. Is the current page a product detail page
2. Is the product tagged `blind-box` or `blind-box-active`
3. Was the app block added to that product template in Theme Editor
4. Is the extension version published
5. Do browser console logs show `[BlindBoxStorefront]`

## Diagnostic States

When Theme Editor mode or debug mode is active, the block now surfaces these states instead of disappearing:

- `Blind Box block only works on product pages`
- `This product is not configured as a blind box`
- `Unable to locate product form — theme incompatibility`

Enable debug mode in the browser console:

```js
window.__BLIND_BOX_DEBUG__ = true;
window.dispatchEvent(new Event("blind_box_debug_refresh"));
```
