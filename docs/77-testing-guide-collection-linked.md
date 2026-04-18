# Testing Guide

## Build Checks

Run:

```powershell
cd app
npm run build

cd ..\web
npm run build
```

## Test Coverage Added For The New Model

- reward candidate preview from a SHOPLINE collection
- self-product exclusion
- out-of-stock exclusion
- ambiguous multi-variant exclusion
- collection-linked paid-order assignment persistence
- collection-linked webhook replay idempotency
- inventory execution still working with reward snapshots

## Legacy Coverage Kept

- legacy manual pool fallback
- duplicate webhook handling
- inventory retry flows

## Sandbox Note

In the current Codex sandbox, `node --test` fails with `spawn EPERM` because the Node test runner tries to fork subprocesses.

That means:

- TypeScript build validation succeeded
- test files compile with the repo
- full runtime test execution still needs to be run locally outside this sandbox

## Recommended Local Test Order

1. `cd app && npm test`
2. verify collection-linked test files pass
3. place a real paid order in the dev store for one migrated blind-box product
4. confirm assignment history and operations pages update correctly
