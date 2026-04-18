# Troubleshooting

## No Blind-Box Detection On Paid Order

Check:

- the blind-box reference has `shopline_product_id`
- the correct variant id is configured when the product has multiple variants
- the blind-box reference is `active`

## Reward Group Not Linked

Symptoms:

- readiness report not available
- paid-order failure with reward-group linkage messaging

Fix:

- save the reward collection
- save the blind-box to reward-group link

## No Eligible Rewards

Check the readiness report for excluded candidates.

Common reasons:

- blind-box product is inside the reward collection
- reward products are out of stock
- reward products are inactive
- reward product has multiple eligible variants
- execute-mode readiness failed

## Inventory Execution Fails

Check:

- `Operations & Recovery` page
- inventory readiness details
- SHOPLINE scopes
- location configuration
- reward variant inventory linkage

## Legacy Data Still Appears

This is expected during migration.

Legacy tables are still present for:

- history
- safe fallback
- staged migration

But they are no longer the intended source of truth.
