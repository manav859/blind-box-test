# Resume Context

Date: 2026-04-16

## Final Architecture State

- blind boxes are now modeled as local references to existing SHOPLINE products
- reward groups are modeled as local references to SHOPLINE collections
- collection membership is authoritative in SHOPLINE admin
- the backend owns only mapping, assignment, inventory execution, and diagnostics
- customers still purchase through native SHOPLINE storefront, cart, and checkout

## Key Files

- schema and migrations:
  - `app/src/db/schema/003_collection_reward_groups.ts`
  - `app/src/db/migrations/run-migrations.ts`
- collection-linked services:
  - `app/src/service/shopline/catalog-service.ts`
  - `app/src/integration/shopline/catalog-gateway.ts`
  - `app/src/service/blind-box/reward-candidate-service.ts`
  - `app/src/service/blind-box/paid-order-assignment-service.ts`
  - `app/src/service/blind-box/blind-box-activation-readiness-service.ts`
- new repositories:
  - `app/src/repository/reward-group-repository.ts`
  - `app/src/repository/blind-box-reward-group-link-repository.ts`
- admin/backend routes:
  - `app/src/controller/admin/blind-box/index.ts`
- web admin pages:
  - `web/src/pages/blind-box/pools.tsx`
  - `web/src/pages/blind-box/pools/new.tsx`
  - `web/src/pages/blind-box/pools/[blindBoxId].tsx`

## Important Migration State

- legacy manual pool items still exist
- legacy product mappings still exist
- paid-order flow prefers collection-linked references and only falls back to legacy paths for unmigrated blind boxes

## Verification State

- `app`: TypeScript build passes
- `web`: production build passes
- `app` runtime tests still need local execution outside the current sandbox because `node --test` fails here with `spawn EPERM`

## Next Likely Follow-Ups

1. run tests locally outside the sandbox
2. migrate legacy blind boxes one by one
3. remove legacy pool-item and sold-mapping fallback after all production data is migrated
