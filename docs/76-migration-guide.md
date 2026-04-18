# Migration Guide

## Goal

Move from:

- backend-managed blind-box pools and manual reward items

to:

- SHOPLINE-admin-managed blind-box products
- SHOPLINE collections as the reward source

## Important Safety Rule

Automatic migration is only partial.

Why:

- existing legacy blind boxes may have multiple sold-product mappings
- the old manual pool items do not identify the correct reward collection automatically

So the migration must be completed manually per blind box.

## Safe Migration Process

1. Open the existing blind box record in the embedded admin.
2. Identify the real SHOPLINE product that customers buy.
3. Update the blind-box reference with:
   - `shopline_product_id`
   - `shopline_variant_id` when needed
4. Create or choose the correct SHOPLINE reward collection in SHOPLINE admin.
5. Save a `reward_group` for that collection.
6. Link the blind-box reference to the reward group.
7. Review readiness and candidate exclusions.
8. Activate only after the readiness report is clean.

## During Migration

- legacy manual pool items remain stored
- legacy sold-product mappings remain stored
- legacy fallback still works for unmigrated blind boxes

## After Migration

Once a blind box has:

- `shopline_product_id`
- a linked reward group

the webhook flow uses the collection-linked path.

## Recommendation

Migrate one blind box at a time and validate:

- paid-order detection
- reward selection
- assignment history
- inventory execution
