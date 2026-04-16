# Webhook Line Identification

## Purpose

This document defines how the paid-order webhook determines which order lines are blind-box purchases.

## Event Entry Point

Paid orders enter through:

- `app/src/controller/webhook/index.ts`

Main processing service:

- `app/src/service/webhook/paid-order-webhook-service.ts`

Assignment orchestration:

- `app/src/service/blind-box/paid-order-assignment-service.ts`

Detection rules:

- `app/src/domain/blind-box/order-detection.ts`

## Identifiers Used

The implemented blind-box flow uses stable identifiers from SHOPLINE order payloads and app records.

Required identifiers:

- `shop`
- `order.id`
- `lineItem.id`
- `lineItem.product_id`
- `lineItem.variant_id`

App-side identifiers:

- `blind_box_product_mappings.blindBoxId`
- `blind_box_product_mappings.productId`
- `blind_box_product_mappings.productVariantId`

Persistence identity:

- `blind_box_assignments.orderId`
- `blind_box_assignments.orderLineId`
- `blind_box_assignments.idempotencyKey`

## Matching Algorithm

For each order line:

1. Ignore lines without `product_id` or line-item `id`.
2. Load enabled blind-box product mappings for the shop.
3. Filter mappings where `mapping.productId === lineItem.product_id`.
4. If the order line has `variant_id`, prefer mappings where `mapping.productVariantId === lineItem.variant_id`.
5. If no exact variant match exists, allow a product-level mapping where `productVariantId` is empty.

This preserves a safe fallback while still preferring exact variant mapping.

## Why This Is Production Safe

- Uses stable numeric or GID identifiers instead of titles.
- Supports product-level fallback only when explicitly configured.
- Keeps shop separation in the database.
- Keeps order-line idempotency stable across webhook retries.

## Quantity Rule

Blind-box order lines currently support quantity `1` only.

Implemented safeguard:

- if a paid order line has quantity greater than `1`, assignment is rejected with `UNSUPPORTED_QUANTITY`

Relevant file:

- `app/src/service/blind-box/paid-order-assignment-service.ts`

This matches the storefront behavior where the theme block always posts `quantity=1`.

## Duplicate Delivery Handling

Webhook deliveries are persisted in `webhook_events`.

Behavior:

- duplicate already-processed webhook events are ignored safely
- repeated processing of the same order line reuses the immutable assignment
- retry flows do not reroll a prize selection

Relevant files:

- `app/src/repository/webhook-event-repository.ts`
- `app/src/service/webhook/webhook-event-service.ts`
- `app/src/service/webhook/paid-order-webhook-service.ts`

## Logging

Current logs include:

- webhook received and verified
- paid-order processing failures
- successful assignment summary after webhook processing

Success log fields include:

- `shop`
- `eventId`
- `assignmentCount`
- `blindBoxId`
- `orderId`
- `lineItemId`
- `assignmentId`
- `selectedPoolItemId`
- `inventoryStatus`

## Recommended Payload Checks During QA

When debugging a paid order:

1. Confirm the sold product page was tagged `blind-box`.
2. Confirm admin has an enabled sold-product mapping for that `productId`.
3. Confirm the order payload line item contains the expected `product_id` and `variant_id`.
4. Confirm the webhook event was stored.
5. Confirm only one assignment exists for each blind-box order line.
