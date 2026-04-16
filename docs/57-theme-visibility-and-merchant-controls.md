# Theme Visibility And Merchant Controls

This phase keeps the Blind Box storefront block merchant-safe while making the real checkout path testable.

## Safe Placement Guidance

This block should be placed on product templates meant for blind-box products.

It is safest when:

- the product is actually sold as a blind-box purchase
- the product carries the exact `blind-box` tag
- the surrounding product content already supports that framing
- the merchant wants expectation-setting copy near the product form

It should not be used as a generic merchandising block on unrelated product templates.

## Render Controls

The block has two visibility layers:

1. Theme schema scope
   - the block only targets `products/detail`
2. Product eligibility gate
   - the product must be tagged `blind-box`

Result:

- wrong template: block cannot render there at all
- correct template but wrong product: live storefront hides the CTA
- Theme Editor on wrong product: a setup message explains the missing tag requirement

## Merchant Controls

- `Display layout`
  Controls the overall visual treatment:
  - `compact`
  - `standard`
  - `highlighted`
- `Information density`
  Controls how much supporting explanation is shown:
  - `compact`
  - `expanded`
- `Show purchase-flow explainer`
  Toggles the explanatory card that says the final item is assigned after purchase.
- `Show collectible note`
  Toggles the rarity or assortment note card.
- `Show store disclaimer`
  Toggles the policy or expectation-setting disclaimer card.

## Empty-State And Optional-Content Behavior

- If the collectible note is hidden or empty, that card disappears cleanly.
- If the disclaimer is hidden or empty, that card disappears cleanly.
- If only one optional note remains, it no longer looks stranded in a broken two-column layout.
- If the purchase-flow explainer is turned off, the main layout collapses to a single main column instead of leaving a visual gap.
- Long text wraps safely across all variants.

## Operational Requirement

The storefront CTA appearing does not replace backend mapping requirements.

Merchants still must:

- map the sold blind-box product or variant in admin
- configure at least one ready pool item
- keep blind-box business logic in the backend

## What Is Intentionally Not Controlled In Theme

The theme still does not control:

- prize assignment
- reveal logic
- inventory mutation
- webhook processing
