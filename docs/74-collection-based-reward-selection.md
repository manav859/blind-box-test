# Collection-Based Reward Selection

## Source

Reward membership comes from the linked SHOPLINE collection, not from backend CRUD.

## Candidate Resolution

Current flow in `RewardCandidateService`:

1. fetch the linked collection
2. fetch all products in the collection with pagination
3. normalize products and variants
4. exclude invalid entries
5. return both eligible and excluded candidates

## Current Exclusion Rules

- the blind-box product itself is present in the reward collection
- inactive or unpublished product
- no variants
- no available or in-stock variants
- multiple eligible variants on one reward product
- execute-mode readiness failure when live execution validation is required

## Selection

- default selection is uniform
- weighted selection is structurally supported
- current collection-linked candidates use `selectionWeight = 1` unless future config extends it

## Persistence

The chosen reward is persisted as a snapshot on the assignment and inventory operation records.

This keeps:

- idempotency
- history
- retry safety

without turning the backend into the collection authority.
