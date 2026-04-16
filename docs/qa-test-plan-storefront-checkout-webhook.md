# QA Test Plan: Storefront Checkout And Paid Webhook

## Goal

Validate the full production blind-box commerce path:

1. storefront product page
2. native add to cart
3. native checkout
4. paid-order webhook
5. assignment creation
6. inventory execution or deferred operation handling

## Prerequisites

Before running QA:

1. Create a real SHOPLINE product for the blind-box purchase.
2. Tag the sellable product with `blind-box`.
3. Publish the product to the storefront channel.
4. In admin, create or open the target blind box.
5. Add an enabled sold-product mapping for the same `productId`.
6. Add `productVariantId` if the product has multiple variants.
7. Add at least one enabled pool item with valid `sourceVariantId`.
8. Run pool-item execute-mode readiness if execution mode is enabled.
9. Activate the blind box only after readiness is satisfied.

## Local Verification

Run these before live-store QA:

- `cd app && npm run build`
- `cd web && npm run build`
- `cd app && npm test`

## Test 1: Product Page Rendering

Steps:

1. Open the tagged product detail page on the storefront.
2. Confirm the blind-box theme block renders.
3. Confirm the CTA label is `Buy Blind Box`.
4. Confirm the explanatory copy mentions random assignment after purchase.

Expected result:

- The block renders only on the tagged blind-box product page.
- The block does not render on unrelated non-tagged products.

## Test 2: Add To Cart

Steps:

1. Select a specific product variant if the product has multiple variants.
2. Click `Buy Blind Box`.
3. Watch browser console for storefront debug logs.

Expected result:

- The selected variant is posted to `/cart/add`.
- Quantity is `1`.
- Console log includes `productId` and selected `variantId`.
- No direct blind-box backend purchase request is made from the theme.

## Test 3: Cart Verification

Steps:

1. Open the native cart after adding the product.
2. Inspect the cart line.

Expected result:

- The correct blind-box storefront product variant is present.
- Quantity is `1`.
- Cart behavior remains native to the SHOPLINE theme.

## Test 4: Checkout Verification

Steps:

1. Proceed through normal SHOPLINE checkout.
2. Complete payment successfully.

Expected result:

- SHOPLINE creates a normal paid order.
- No custom checkout or external purchase API is involved.

## Test 5: Paid Webhook Verification

Steps:

1. Inspect backend logs after payment.
2. Open the admin failures and assignments pages.

Expected result:

- The paid-order webhook is received.
- Logs show webhook processing for the shop and event id.
- If successful, logs show assignment summary output.

## Test 6: Assignment Verification

Steps:

1. Open admin `Assignments`.
2. Find the new order id.
3. Open admin `Failures` and `Inventory Operations` if needed.

Expected result:

- Exactly one assignment exists for the blind-box order line.
- The selected pool item is recorded.
- Inventory status is correct for the configured execution mode.

## Test 7: Multi-Quantity Protection

Steps:

1. Attempt to increase blind-box quantity in the storefront or cart if the theme allows it.
2. Complete checkout with quantity greater than `1`.

Expected result:

- Preferred outcome: storefront keeps quantity fixed to `1`.
- If a quantity greater than `1` order still reaches the webhook, backend records a controlled `UNSUPPORTED_QUANTITY` failure instead of creating multiple ambiguous assignments.

## Test 8: Duplicate Webhook Idempotency

Steps:

1. Replay the same paid-order webhook payload or trigger the retry path.
2. Inspect assignments and webhook events.

Expected result:

- No second prize roll occurs.
- Existing assignment remains immutable.
- Duplicate processed events are ignored safely or recover the same workflow state.

## Test 9: Out-Of-Stock Or Not-Ready Prize Item

Steps:

1. Disable or drain the only eligible pool item.
2. Attempt activation or process a paid order in a controlled environment.

Expected result:

- Activation should be blocked when no ready pool item exists.
- If store state drifts after activation, the backend should fail clearly with readiness or inventory workflow errors rather than silently misassigning.

## Test 10: Misconfiguration

Steps:

1. Tag a storefront product with `blind-box`.
2. Do not create an enabled sold-product mapping.
3. Attempt storefront QA.

Expected result:

- The storefront block can still render because it uses the product tag gate.
- The admin debug and blind-box setup pages should show missing mapping status.
- The paid-order webhook should not falsely match the order line to a blind box.

## Test 11: Mixed Cart

Steps:

1. Add a normal product and a blind-box product to the same cart.
2. Complete checkout.

Expected result:

- Only the mapped blind-box line produces an assignment.
- Normal product lines are ignored by blind-box detection.

## Test 12: Storefront Unavailable Variant

Steps:

1. Open a tagged blind-box product where the selected variant is unavailable or unpublished.
2. Observe the blind-box purchase block.

Expected result:

- The blind-box button is disabled.
- The UI shows a merchant-safe unavailable message.
- No malformed add-to-cart submission occurs.

## Recommended Evidence Collection

Capture:

- storefront screenshot of the tagged product page
- cart screenshot showing the sold blind-box variant
- order id from SHOPLINE admin
- webhook log lines
- assignment record screenshot
- inventory operation record screenshot if execution mode is enabled
