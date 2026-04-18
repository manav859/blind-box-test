# Data Model

## Existing Core Tables

- `blind_boxes`
- `blind_box_assignments`
- `inventory_operations`
- `webhook_events`

## Updated Role Of `blind_boxes`

`blind_boxes` now acts as the local blind-box product reference record.

Important fields:

- `shopline_product_id`
- `shopline_variant_id`
- `product_title_snapshot`
- `status`
- `selection_strategy`
- `config_json`

This record does not create or own the SHOPLINE product.

## New Tables

### `reward_groups`

Represents a reward source group backed by a SHOPLINE collection.

Key fields:

- `source_type`
- `shopline_collection_id`
- `collection_title_snapshot`
- `status`
- `config_json`

### `blind_box_reward_group_links`

Maps one blind-box product reference to one reward group.

Constraint:

- unique per `shop + blind_box_id`

## Assignment Extensions

`blind_box_assignments` now also stores reward snapshots:

- `reward_group_id`
- `selected_reward_product_id`
- `selected_reward_variant_id`
- `selected_reward_title_snapshot`
- `selected_reward_variant_title_snapshot`
- `selected_reward_payload_json`

Legacy fields such as `selected_pool_item_id` remain for backward compatibility and history.

## Inventory Operation Extensions

`inventory_operations` now also stores reward execution context:

- `reward_group_id`
- `reward_product_id`
- `reward_variant_id`
- `reward_title_snapshot`
- `reward_variant_title_snapshot`

This allows inventory execution to run even when no manual pool item row exists.
