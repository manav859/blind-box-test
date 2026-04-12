# Phase 1 Backend Foundation Plan

## Purpose Of This Phase

Phase 1 establishes the Blind Box backend foundation inside the existing `app/` workspace without changing the current auth/session/runtime flow.

This phase is not the full feature build. It is the minimum backend groundwork needed so later phases can add paid-order assignment, admin UI, and storefront integration safely.

## Constraints From The Current Repo

Phase 1 must respect the current scaffold:

- keep the root SHOPLINE CLI setup intact
- do not break `npm run dev`
- keep `shopline.app.toml`, `shopline.app.blindbox-test-01.toml`, `app/shopline.web.toml`, and `web/shopline.web.toml`
- keep embedded auth/session setup in `app/src/shopline.ts`
- keep route bootstrapping in `app/src/index.ts`
- keep authoritative blind-box logic in the backend only
- do not move storefront code into `web/`

## Phase 1 Goal

At the end of Phase 1, the backend should have:

- a durable blind-box domain persistence plan
- backend module boundaries in place
- initial schema entities for pools, mappings, assignments, webhook events, and inventory operations
- verified webhook processing scaffolding
- inventory-operation scaffolding
- minimal authenticated admin API foundations for backend verification
- tests for foundation-level rules and data boundaries

It should not yet attempt the full paid-order draw workflow.

## Exact Backend Modules To Add First

These modules fit the existing `app/src` structure and should be added before feature-heavy work.

### 1. Shared backend support

Recommended first files:

- `app/src/lib/logger.ts`
- `app/src/lib/errors.ts`
- `app/src/lib/config.ts`
- `app/src/lib/request-context.ts`

Reason:

- every webhook, assignment, and inventory action needs structured context and reusable error handling before the real workflow is added

### 2. Database bootstrap layer

Recommended first files:

- `app/src/db/client.ts`
- `app/src/db/migrations/`
- `app/src/db/schema/`

Reason:

- blind-box domain persistence should start with a deliberate DB boundary instead of direct ad hoc queries

### 3. Core blind-box domain types

Recommended first files:

- `app/src/domain/blind-box/types.ts`
- `app/src/domain/blind-box/status.ts`
- `app/src/domain/blind-box/validation.ts`

Reason:

- the repo currently has no shared domain vocabulary for pools, mappings, assignments, or inventory operations

### 4. Repository layer

Recommended first files:

- `app/src/repository/shop-repository.ts`
- `app/src/repository/blind-box-pool-repository.ts`
- `app/src/repository/blind-box-pool-item-repository.ts`
- `app/src/repository/blind-box-product-mapping-repository.ts`
- `app/src/repository/webhook-event-repository.ts`
- `app/src/repository/order-line-assignment-repository.ts`
- `app/src/repository/inventory-operation-repository.ts`

Reason:

- persistence should be centralized from the start so idempotency and transaction boundaries stay enforceable

### 5. Webhook foundation services

Recommended first files:

- `app/src/service/webhook/record-webhook-event.ts`
- `app/src/service/webhook/dispatch-webhook-topic.ts`
- `app/src/service/webhook/process-paid-order-foundation.ts`

Reason:

- the existing webhook controller already verifies requests; Phase 1 should turn it into a thin entrypoint backed by durable event handling modules

### 6. Blind-box admin foundation services

Recommended first files:

- `app/src/service/blind-box/create-pool.ts`
- `app/src/service/blind-box/list-pools.ts`
- `app/src/service/blind-box/upsert-pool-item.ts`
- `app/src/service/blind-box/create-product-mapping.ts`
- `app/src/service/blind-box/list-product-mappings.ts`

Reason:

- the backend needs enough CRUD surface to populate and verify the foundational schema before the paid-order workflow exists

### 7. Inventory foundation services and interfaces

Recommended first files:

- `app/src/service/inventory/create-inventory-operation.ts`
- `app/src/service/inventory/list-inventory-operations.ts`
- `app/src/integration/shopline/inventory-gateway.ts`
- `app/src/integration/shopline/order-gateway.ts`

Reason:

- inventory handling must exist as a first-class backend concern early, even if the actual mutation workflow is completed in the next phase

### 8. Admin API controllers

Recommended first files:

- `app/src/controller/admin/blind-box/pools.ts`
- `app/src/controller/admin/blind-box/product-mappings.ts`
- `app/src/controller/admin/blind-box/inventory-operations.ts`

Reason:

- the backend foundation should be observable through authenticated APIs without waiting for the full dashboard build

## Recommended Persistence Approach For Blind Box Domain Data

Recommended approach:

- keep the existing `app/database.sqlite` session store untouched for embedded auth sessions
- add a separate migration-backed relational persistence layer for blind-box domain data
- use transactions and unique constraints from the start
- keep repository interfaces independent from any single deployment database vendor

Recommended environment model:

- local development:
  relational DB suitable for fast local setup, with migrations
- production:
  managed relational DB with transactional guarantees

Critical rule:

- blind-box business tables should not be treated as part of the auth session store just because SQLite already exists in the scaffold

Reason:

- sessions and blind-box business data have different lifecycle, integrity, and audit requirements

## Schema Entities Needed First

These are the first schema entities needed to support the foundation.

### `shops`

Purpose:

- merchant/store identity
- future store-level settings

### `blind_box_pools`

Purpose:

- define each prize pool
- store pool name, status, and selection strategy

### `blind_box_pool_items`

Purpose:

- store eligible prize items within a pool
- track enabled flag, weight, source product or variant reference, and logical inventory fields

### `blind_box_product_mappings`

Purpose:

- map a sellable blind-box product or variant to a pool

### `webhook_events`

Purpose:

- record incoming verified webhook deliveries
- support deduplication and replay-safe processing

### `order_line_assignments`

Purpose:

- hold the permanent chosen item for a blind-box order line
- enforce one assignment per `shop + order + order line`

### `inventory_operations`

Purpose:

- track reservation or decrement attempts
- store correlation IDs, status, and retry metadata

## Webhook-Related Modules Needed First

The current controller already verifies webhooks. Phase 1 should add the durable backend path behind that verification.

Needed first:

- verified event recorder
- topic dispatcher
- paid-order foundation handler
- webhook repository
- webhook status model

Expected behavior in Phase 1:

- receive verified webhook payload
- extract stable identifiers
- record or upsert event state
- route to a phase-safe handler
- return a predictable result

What is still deferred:

- full paid-order blind-box assignment execution
- full retry policy for downstream inventory mutations

## Inventory-Related Modules Needed First

Inventory modules should be introduced early because blind-box assignment cannot be safe without them.

Needed first:

- inventory operation repository
- inventory operation status model
- inventory gateway interface for SHOPLINE calls
- service for creating and reading inventory operation records

Phase 1 scope:

- define the data model and orchestration boundary
- record intended inventory work
- prepare the integration seam

Deferred:

- final production inventory decrement workflow
- retry workers or advanced recovery automation

## Minimal API Surface For Phase 1 Foundation

Phase 1 should expose only the minimum authenticated backend APIs needed to exercise the foundation.

Recommended Phase 1 endpoints:

- `GET /api/blind-box/pools`
  list current pools
- `POST /api/blind-box/pools`
  create a pool
- `POST /api/blind-box/pools/:poolId/items`
  add or update a pool item
- `GET /api/blind-box/product-mappings`
  list product mappings
- `POST /api/blind-box/product-mappings`
  create or update a product-to-pool mapping
- `GET /api/blind-box/inventory-operations`
  inspect recorded inventory-operation entries
- `POST /api/webhooks`
  existing route retained, expanded internally to record verified webhook events for blind-box topics

Why this API surface is enough for Phase 1:

- it proves persistence and repository wiring
- it supports early backend verification without a full dashboard
- it avoids prematurely exposing customer-facing behavior

## What Will Be Implemented In Phase 1

- backend shared support modules
- blind-box persistence bootstrap
- initial schema entities
- repository layer
- webhook event recording and dispatch scaffolding
- inventory-operation recording scaffold
- minimal authenticated admin API endpoints for pools, items, mappings, and operations
- tests for schema/repository/idempotency primitives
- documentation for the phase

## What Is Deferred To Later Phases

- exact paid-order selection workflow
- weighted random selection implementation
- permanent assignment execution triggered by a paid-order webhook
- actual SHOPLINE inventory decrement logic
- merchant dashboard pages and UX polish
- theme extension implementation
- customer-facing reveal experience
- reporting, analytics, and launch hardening work

## Phase 1 Testing Plan

When Phase 1 is implemented, it should be testable in this order:

1. backend unit tests for domain status models and validation
2. repository tests for create/list/upsert behavior
3. webhook tests proving verified events are recorded once
4. API tests for pool, item, mapping, and inventory-operation endpoints
5. manual authenticated API checks while running the existing root dev flow

## Exit Criteria For Phase 1

Phase 1 is complete when:

- blind-box domain persistence exists
- the backend has repository and service boundaries
- verified webhook events can be recorded durably
- pool and mapping records can be created through authenticated backend APIs
- inventory-operation records can be created and inspected
- no frontend or theme layer contains assignment logic
- `npm run dev` still works through the existing SHOPLINE CLI setup

## Exact Next Coding Step After This Planning Doc

The first coding step after this document should be:

- add the backend shared support layer and persistence bootstrap inside `app/src`
- then add the initial schema and repository modules before any admin UI work

That keeps the project aligned with the current repo and preserves backend ownership of all Blind Box business logic.
