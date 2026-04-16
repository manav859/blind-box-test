# Private-App Scope And Config Checklist

Date: 2026-04-13

## Purpose

This checklist records the exact private-app and runtime configuration now required for the backend execute-mode path.

It is intentionally limited to the current phase.

It does not include theme extension requirements.

## Repo Scope Configuration

Current repo files:

- `shopline.app.toml`
- `shopline.app.blindbox-test-01.toml`

Current configured scopes:

- `write_products`
- `read_products`
- `read_inventory`
- `read_location`
- `write_inventory`

## What Each Scope Is Used For

### Required Now For The Current Execute Path

- `read_products`
  - required because the backend resolves a pool item's `sourceProductId` or `sourceVariantId`
  - used for:
    - `GET /products/:id.json`
    - `GET /products/variants/:variant_id.json`

- `read_inventory`
  - required because the backend validates the resolved inventory item and its location linkage before execute mode starts
  - used for:
    - `GET /inventory_items/:inventory_item_id.json`
    - `GET /inventory_levels.json`

- `read_location`
  - required because the backend validates the target location for execute mode
  - used for:
    - `GET /locations/list.json`

- `write_inventory`
  - required because execute mode mutates inventory
  - used for:
    - `POST /inventory_levels/adjust.json`

### Retained In Repo But Not Required By Blind-Box Execute Logic Itself

- `write_products`
  - retained because it already exists in the current SHOPLINE CLI app config and sample scaffold behavior
  - not used by the blind-box inventory execute path itself

## What Is Not Required Yet

Not required in the current phase:

- theme/storefront-related scopes
- extra order-read scopes for blind-box execution

Reason:

- paid-order processing currently relies on the verified webhook payload
- the execute path does not currently perform admin order enrichment
- theme app extension work has not started

## Required Runtime Config

### Always Relevant

- `SCOPES`
  - must reflect the currently authorized app scopes in runtime
- `BLIND_BOX_INVENTORY_EXECUTION_MODE`
  - `deferred` or `execute`

### Required Or Strongly Recommended For Execute Mode

- `BLIND_BOX_SHOPLINE_LOCATION_ID`
  - recommended whenever the store has multiple active locations
  - now validated against active store locations

- `SHOPLINE_ADMIN_API_VERSION`
  - defaults to `v20230901`
  - change only if the connected store needs a different supported version

## Merchant Or Operator Checklist

### Private App

1. Update the app scopes in the repo config.
2. Reauthorize or reinstall the private app in the connected store.
3. Confirm the active token now carries the updated scopes.

### Pool Item Setup

For every pool item intended for execute mode:

1. Set `sourceVariantId` when possible.
2. If only `sourceProductId` is used, confirm the product has exactly one variant.
3. Confirm the variant exposes an inventory item in SHOPLINE.
4. Confirm the inventory item is tracked.
5. Confirm the inventory item is linked to the target location.

### Location Setup

One of these must be true:

1. `BLIND_BOX_SHOPLINE_LOCATION_ID` is set to an active location id.
2. The store has one default active location that the backend can resolve.
3. The store has exactly one active location.

If none are true:

- execute mode is not ready

## Readiness Checklist For This Repo

Before enabling `execute`:

- repo config includes:
  - `read_products`
  - `read_inventory`
  - `read_location`
  - `write_inventory`
- connected store token is refreshed after the scope change
- at least one pool item validates as `ready`
- the operator understands the retry path and failure meanings

## Later Scope Review

Review again before future phases if the backend later adds:

- admin order lookups
- product search/picker support
- richer operator tooling
- theme or storefront extension behavior

Those later capabilities may require more scopes, but they are not part of the current validated execute path.
