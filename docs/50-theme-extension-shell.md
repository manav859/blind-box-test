# Theme Extension Shell

This phase adds the initial theme app extension shell for the Blind Box storefront surface.

It is intentionally presentation-only.

## Extension Structure

The storefront shell now lives under:

```text
extensions/
  blind-box-theme/
    .shopline-cli.yml
    blocks/
      blind-box-product-shell.html
    components/
      blind-box-badge-icon/
        badge-icon.html
    i18n/
      en.json
      en.schema.json
      zh-hans-cn.json
      zh-hans-cn.schema.json
    public/
      blind-box-product-shell.css
```

This follows the current SHOPLINE OS 3.0 theme app extension shape:

- `blocks/` for app blocks
- `components/` for reusable Sline snippets
- `i18n/` for storefront and schema translations
- `public/` for extension CSS assets
- `.shopline-cli.yml` for extension project metadata

## What The Block Does Now

The new app block is a product-page storefront shell that shows:

- Blind Box badge/title
- short explanatory copy
- a fixed purchase note stating the final item is assigned after purchase
- optional rarity / collectible note
- optional disclaimer
- optional icon / badge treatment

The block is restricted to the `product` template and can be added through the theme editor.

## What Is Intentionally Deferred

This phase does not connect to unfinished live blind-box logic.

Deferred on purpose:

- live assignment or reveal data
- random selection logic
- checkout behavior
- fulfillment logic
- order-linked customer result UI
- inventory mutation or readiness logic in the storefront

## How This Will Later Connect To Backend Flow

Later storefront integration can build on this shell by connecting backend-validated blind-box behavior through safe data boundaries such as:

- product or app metafield flags that identify blind-box products
- backend-provided copy or state for eligible products
- post-purchase result or account/order views once assignment and recovery workflows are fully validated

The current shell is deliberately a visual layer only, so backend fulfillment ownership remains unchanged.
