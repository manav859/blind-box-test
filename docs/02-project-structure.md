# Project Structure

## Purpose Of This Document

This document recommends how Blind Box development should fit inside the current repository without breaking the existing SHOPLINE CLI setup.

It is based on the current repo state documented in [01-repo-understanding.md](C:/Users/manav/blindbox-test-01/docs/01-repo-understanding.md:1).

## Structural Principles

- Preserve the current root workspace split:
  `app`, `web`, and future `extensions/*`
- Keep blind-box business logic in `app/`
- Keep the merchant dashboard in `web/`
- Add storefront code later under `extensions/*`
- Keep docs in `docs/`
- Add tests in locations that fit the current workspace behavior instead of inventing a separate monorepo toolchain

## Recommended High-Level Structure

Recommended direction inside the existing repo:

```text
blindbox-test-01/
  docs/
    00-required-skills-and-execution-plan.md
    01-repo-understanding.md
    02-project-structure.md
    03-phase-1-backend-foundation-plan.md

  app/
    src/
      index.ts
      shopline.ts
      controller/
        product/
        webhook/
        blind-box/
        admin/
      service/
        product/
        blind-box/
        webhook/
        inventory/
      repository/
      integration/
        shopline/
      domain/
        blind-box/
      lib/
      db/
    test/

  web/
    src/
      App.tsx
      Routes.tsx
      hooks/
      utils/
      pages/
        blind-box/
      components/
        blind-box/
      locales/
    src/**/*.test.tsx

  extensions/
    blind-box-theme/
      ...
```

Notes:

- `extensions/` does not exist yet and should only be added when storefront work begins
- `app/test/` does not exist yet; it is the recommended home for backend integration-style tests if needed
- backend unit tests can also be colocated as `app/src/**/*.spec.ts`, which fits the current `nodemon.json` ignore pattern

## Where Backend Modules Should Live

The current backend already uses `controller/` and `service/`. Blind Box work should expand that structure instead of replacing it.

### `app/src/controller/`

Purpose:

- HTTP ingress only
- request parsing
- response shaping
- auth/session context extraction

Recommended additions:

- `controller/admin/blind-box/`
  for authenticated merchant admin APIs
- `controller/webhook/`
  retain existing webhook entrypoint and add blind-box-specific routing under it
- `controller/blind-box/`
  optional neutral controller layer if admin endpoints grow beyond CRUD

What should not live here:

- selection logic
- inventory decision logic
- direct query-heavy persistence logic

### `app/src/service/`

Purpose:

- business orchestration
- phase-level use cases
- multi-step workflows

Recommended additions:

- `service/blind-box/`
  pool management, product mapping, eligibility checks, assignment preparation
- `service/webhook/`
  verified event recording, routing, idempotent processing orchestration
- `service/inventory/`
  reservation/reduction orchestration and retry state handling

### `app/src/repository/`

Purpose:

- all blind-box data access
- consistent query boundaries
- idempotent writes and lookups

Recommended repository areas:

- pools
- pool items
- product mappings
- webhook events
- order-line assignments
- inventory operations
- shops or merchant settings

### `app/src/integration/shopline/`

Purpose:

- isolate SHOPLINE OpenAPI or admin API calls
- keep platform-specific fetch logic out of controllers and core services

Recommended modules:

- products gateway
- orders gateway
- inventory gateway
- webhook payload mapping helpers

### `app/src/domain/blind-box/`

Purpose:

- pure domain rules
- type definitions
- selection strategies
- eligibility rules
- status enums and invariants

Recommended contents:

- pool and item types
- mapping types
- assignment state model
- selection strategy model
- validation helpers

### `app/src/lib/`

Purpose:

- shared utilities needed across backend layers

Recommended contents:

- logger
- error types
- id helpers
- config loaders
- request correlation helpers

### `app/src/db/`

Purpose:

- database bootstrap and migration boundary for blind-box domain persistence

Recommended contents:

- DB client/bootstrap
- schema bootstrap or migration entrypoints
- transaction helpers

## Where Admin Dashboard Pages And Components Should Live

The embedded merchant dashboard should remain inside `web/`.

### `web/src/pages/`

Current state:

- page-based route generation already exists

Recommended additions:

- `pages/blind-box/overview.tsx`
- `pages/blind-box/pools.tsx`
- `pages/blind-box/mappings.tsx`
- `pages/blind-box/assignments.tsx`
- `pages/blind-box/operations.tsx`

Reason:

- this fits the existing route generation pattern from `web/src/App.tsx` and `web/src/Routes.tsx`

### `web/src/components/`

Recommended additions:

- `components/blind-box/PoolTable.tsx`
- `components/blind-box/PoolForm.tsx`
- `components/blind-box/MappingForm.tsx`
- `components/blind-box/AssignmentStatusTable.tsx`
- `components/blind-box/OperationLogPanel.tsx`

Reason:

- `components/` already exists as a placeholder and is the correct place for reusable admin UI pieces

### `web/src/hooks/`

Recommended additions:

- backend API hooks or fetch helpers specific to blind-box admin data
- route or state helpers for admin workflows

Constraint:

- these hooks should only call backend APIs
- they must never perform authoritative assignment or inventory logic

## Where Future Theme Extension Code Should Live

The future storefront integration should live in a dedicated extension workspace:

- `extensions/blind-box-theme/`

Why:

- root `package.json` already reserves `extensions/*`
- storefront code does not belong in the embedded admin app
- this preserves the current CLI/workspace model

Recommended future extension areas:

- app embed or theme block definitions
- storefront liquid or extension assets
- any safe presentation-only logic needed for merchandising

What must not live in the extension:

- blind-box winner selection
- assignment persistence
- inventory mutation
- admin secrets or tokens

## Where Tests Should Live

There is no test setup yet, but the recommended locations should align with the current workspaces.

### Backend tests

Recommended locations:

- unit tests colocated as `app/src/**/*.spec.ts`
- integration tests under `app/test/`

Why this fits the current repo:

- `app/nodemon.json` already ignores `src/**/*.spec.ts`
- backend logic will be concentrated in `app/src/`

### Frontend tests

Recommended locations:

- `web/src/**/*.test.tsx`

Why:

- it keeps page/component tests close to the embedded admin UI modules they validate

### Extension tests

Recommended later location:

- inside the future extension workspace under `extensions/blind-box-theme/`

## Where Docs Should Live

All phase and architecture docs should stay in `docs/`.

Recommended pattern:

- `00-...` for project-wide direction
- `01-...`, `02-...`, `03-...` for current baseline and phase planning
- future numbered docs for each implementation phase, migrations, runbooks, and deployment notes

## Layer Ownership Summary

### Backend in `app/`

Owns:

- blind-box domain rules
- idempotency
- webhook verification and processing
- inventory-safe assignment
- database persistence
- admin APIs
- secure storefront support APIs

### Embedded admin in `web/`

Owns:

- merchant-facing configuration UI
- dashboard and operational visibility
- calling authenticated backend APIs

Must not own:

- winner selection
- inventory mutation authority
- permanent assignment decisions

### Theme extension in `extensions/*`

Owns:

- customer-facing presentation
- theme blocks or app embeds
- safe display-only Blind Box merchandising

Must not own:

- authoritative backend logic

## Safe Structural Expansion Sequence

Recommended order:

1. expand `app/src/` with blind-box backend modules
2. add backend tests
3. add minimal admin-facing endpoints
4. expand `web/src/` with admin pages and components
5. create `extensions/` only when storefront work begins

This order preserves the existing CLI flow and keeps business-critical logic in the backend first.
