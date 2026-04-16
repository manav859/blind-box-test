# Theme UX Polish

This phase improves the Blind Box product-page shell so it reads like a production storefront component instead of a basic scaffold.

## What Changed

- Stronger content hierarchy:
  - clearer badge row
  - larger headline treatment
  - more readable supporting copy
- Better structure:
  - main product explanation stays in the primary column
  - the purchase-flow promise sits in a separate support card
  - collectible note and disclaimer now render as distinct note cards
- Improved visual polish:
  - softer layered background treatment
  - clearer borders and shadow depth
  - better spacing between block sections
- Better responsive behavior:
  - notes collapse cleanly on mobile
  - long text and long merchant copy wrap safely
  - the badge remains readable instead of breaking awkwardly
- Accessibility and readability improvements:
  - semantic heading and aside structure
  - stronger contrast for primary content
  - safer text wrapping with `overflow-wrap`

## Variant Refinement

The storefront block now uses merchant-facing display variants instead of abstract tone names.

- `compact`
  Best when the product page is already visually busy and the Blind Box explanation needs a smaller footprint.
- `standard`
  Best default for normal product detail pages.
- `highlighted`
  Best for launch products, featured collectibles, or pages where the Blind Box card should draw stronger attention.

## Merchant-Facing Improvements

- clearer setting labels such as `Headline`, `Supporting description`, and `Collectible note`
- more explicit setting descriptions about what the block does
- better defaults that explain the blind-box format without implying instant reveal or checkout logic

## What Is Still Deferred

This block is still presentation only.

It does not add:

- assignment logic
- random selection logic
- reveal or result UI
- checkout behavior
- backend-driven blind-box status

Those pieces remain intentionally deferred until backend validation and final storefront integration are complete.
