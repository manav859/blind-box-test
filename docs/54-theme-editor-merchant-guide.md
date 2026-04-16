# Theme Editor Merchant Guide

The Blind Box storefront block is now a real commerce helper for product detail pages.

## What Merchants Can Configure

- `Show blind box badge`
  Displays the Blind Box label row at the top of the card.
- `Show icon next to badge`
  Shows the decorative blind-box icon beside the badge.
- `Badge label`
  Lets the merchant rename the badge, for example `Blind Box` or `Collectible Drop`.
- `Headline`
  Main title shown in the block.
- `Supporting description`
  Short explanatory copy that tells the shopper the final item is assigned after purchase.
- `Display layout`
  Chooses one of three variants:
  - `compact`
  - `standard`
  - `highlighted`
- `Information density`
  Controls whether the block stays tighter (`compact`) or shows fuller supporting explanation (`expanded`).
- `Show purchase-flow explainer`
  Turns the explanatory side card on or off.
- `Show collectible note`
  Lets the merchant hide rarity messaging even if note text is present.
- `Collectible note`
  Optional note for rarity tiers, assortment messaging, or collectible framing.
- `Show store disclaimer`
  Lets the merchant hide disclaimer messaging when the template should stay lighter.
- `Store disclaimer`
  Optional note for policy or expectation-setting copy.

## Where This Block Must Be Used

Use this block only on:

- product detail templates for blind-box products

Do not use this block as a generic merchandising block on:

- home page
- search page
- collection page
- non-blind-box product templates

## What Conditions Control Rendering

Even after the block is added in Theme Editor, the live storefront CTA only appears when:

1. the page is a product detail page
2. the product has the exact `blind-box` or `blind-box-active` tag
3. the surrounding theme still provides a native product add-to-cart form

In Theme Editor:

- if the product is not tagged, the block shows a setup message instead of silently failing
- if the product form cannot be found, the block shows a theme incompatibility message in Theme Editor or debug mode

## What The Block Does Now

The block now:

- renders on eligible blind-box product pages
- shows a native `Buy Blind Box` CTA
- submits the selected real SHOPLINE variant to native cart
- keeps quantity fixed to `1`
- explains that the final item is assigned after purchase

## What The Block Still Does Not Do

The block still does not:

- decide which prize the customer gets
- call the backend to purchase
- bypass native SHOPLINE checkout
- show live assignment results on the product page

Backend assignment remains webhook-driven after payment.

## Theme-Editor Testing

Use this exact flow:

1. Open SHOPLINE admin.
2. Go to `Online Store`.
3. Open the target theme and click `Customize`.
4. Switch to a product detail template.
5. Open a real blind-box sold product in preview.
6. Add the app block `Blind Box Purchase (Product Page Only)`.
7. Save the template.
8. Confirm the block shows the commerce CTA on the tagged product.
