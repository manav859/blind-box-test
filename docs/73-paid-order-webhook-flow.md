# Paid-Order Webhook Flow

## Entry

- `POST /api/webhooks`
- verified by SHOPLINE first

## Processing Steps

1. Webhook controller verifies the request.
2. `WebhookEventService` builds or reads a stable event id.
3. Duplicate processed or ignored events short-circuit safely.
4. Paid-order assignment service detects blind-box lines.
5. Detection first loads the SHOPLINE product for each line and applies the centralized `isBlindBoxProduct(product)` rule.
6. When a tagged blind-box product is detected, the backend auto-hydrates a lightweight cache record on `blind_boxes` if one does not already exist.
7. Existing local product references and legacy product mappings remain fallback-only compatibility paths.
8. For collection-linked blind boxes:
   - resolve linked reward group
   - fetch collection products
   - normalize and filter candidates
   - select one reward
   - persist assignment + inventory boundary
9. For legacy blind boxes:
   - fallback to manual pool-item selection
10. Inventory execution runs immediately in execute mode, or remains pending in deferred mode.
11. Structured webhook event status is updated to `processed`, `ignored`, or `failed`.

## Idempotency

Assignment identity remains:

- `shop + order_id + order_line_id`

Replays do not reroll the reward.

If the assignment already exists:

- the selected reward snapshot is reused
- the inventory boundary is ensured
- the webhook replay remains safe
