# Phase 1 Backend Foundation Implementation

## Purpose Of This Document

This document records the actual backend foundation added in Phase 1 and explains how it fits the current SHOPLINE CLI scaffold without breaking the existing auth/session flow.

## What Was Added

The implementation in this phase adds a production-oriented Blind Box backend foundation inside `app/src` while keeping the existing SHOPLINE starter flow intact.

### Shared backend support

Added:

- `app/src/lib/config.ts`
- `app/src/lib/logger.ts`
- `app/src/lib/errors.ts`
- `app/src/lib/request-context.ts`
- `app/src/lib/http.ts`
- `app/src/lib/shop-session.ts`

Why these exist:

- `config.ts`
  centralizes runtime config for the new blind-box domain database and log level
- `logger.ts`
  provides structured logging for startup, webhook handling, and future assignment/inventory workflows
- `errors.ts`
  provides reusable backend error classes so controllers and services do not rely on ad hoc status handling
- `request-context.ts`
  standardizes request IDs and log context for API and webhook work
- `http.ts`
  provides safe JSON body parsing and a consistent controller error response helper
- `shop-session.ts`
  keeps access to the authenticated SHOPLINE shop/session context explicit and reusable

### Separate Blind Box persistence bootstrap

Added:

- `app/src/db/client.ts`
- `app/src/db/migrations/run-migrations.ts`
- `app/src/db/schema/initial-foundation.ts`

Why these exist:

- `db/client.ts`
  opens the separate blind-box domain database, exposes promise-based SQLite helpers, and initializes the persistence layer at startup
- `db/migrations/run-migrations.ts`
  creates and runs tracked schema migrations through a `schema_migrations` table
- `db/schema/initial-foundation.ts`
  defines the first migration for the blind-box domain tables

### Initial Blind Box domain types and validation

Added:

- `app/src/domain/blind-box/status.ts`
- `app/src/domain/blind-box/types.ts`
- `app/src/domain/blind-box/validation.ts`

Why these exist:

- `status.ts`
  defines the initial state vocabularies for blind boxes, assignments, webhook events, and inventory operations
- `types.ts`
  defines the domain records and normalized input shapes used by repositories and services
- `validation.ts`
  creates the first reusable validation boundary for creating boxes, items, mappings, assignments, and inventory operations

### Repository foundation

Added:

- `app/src/repository/helpers.ts`
- `app/src/repository/blind-box-repository.ts`
- `app/src/repository/blind-box-pool-item-repository.ts`
- `app/src/repository/blind-box-product-mapping-repository.ts`
- `app/src/repository/blind-box-assignment-repository.ts`
- `app/src/repository/webhook-event-repository.ts`
- `app/src/repository/inventory-operation-repository.ts`

Why these exist:

- repositories isolate SQL from the rest of the backend
- they create clean interfaces for later service expansion
- they establish the first persistence contracts for:
  blind boxes, pool items, product mappings, assignments, webhook events, and inventory operations

### Service-layer skeletons

Added:

- `app/src/service/blind-box/blind-box-service.ts`
- `app/src/service/blind-box/pool-item-service.ts`
- `app/src/service/blind-box/product-mapping-service.ts`
- `app/src/service/blind-box/assignment-service.ts`
- `app/src/service/webhook/webhook-event-service.ts`
- `app/src/service/inventory/inventory-operation-service.ts`

Why these exist:

- services keep normalization, orchestration, and future business flow out of controllers
- webhook event recording is now a service concern instead of being fully inline in the controller
- assignments and inventory operations now have backend-owned service boundaries even though the final business flow is deferred

### Minimal backend route/controller scaffolding

Added:

- `app/src/controller/admin/blind-box/index.ts`

Updated:

- `app/src/index.ts`
- `app/src/controller/webhook/index.ts`

Why these exist:

- the new admin controller exposes a small authenticated foundation API for:
  blind-box pools, pool items, product mappings, assignments, and inventory operations
- `app/src/index.ts` now initializes the blind-box persistence layer at startup and mounts the new admin router under `/api/blind-box`
- the existing webhook controller still verifies webhooks through SHOPLINE, but now also records verified webhook events in the blind-box domain database

### Integration contracts for later phases

Added:

- `app/src/integration/shopline/inventory-gateway.ts`
- `app/src/integration/shopline/order-gateway.ts`

Why these exist:

- they reserve explicit platform integration seams for later inventory and order workflows
- they keep future SHOPLINE API integration out of controllers and core domain modules

## Foundation Schema Added

The first migration creates these domain tables:

- `blind_boxes`
- `blind_box_pool_items`
- `blind_box_product_mappings`
- `blind_box_assignments`
- `webhook_events`
- `inventory_operations`
- `schema_migrations`

Current meaning of the top-level table:

- `blind_boxes` is the primary merchant-managed blind-box container in this phase
- later phases can treat each row as the authoritative box or pool root for mappings, items, and assignments

## How Persistence Is Now Split From Session Storage

The existing SHOPLINE auth/session behavior is preserved:

- `app/src/shopline.ts` still uses `SQLiteSessionStorage`
- the existing session database path remains:
  `app/database.sqlite`

Blind-box domain persistence is now separate:

- `app/src/db/client.ts` creates a different SQLite database for blind-box business data
- the default local path is:
  `app/blind-box-domain.sqlite`

Why this split matters:

- auth sessions and blind-box business state have different lifecycle and integrity requirements
- blind-box assignments, webhook events, and inventory operations need a separate persistence boundary so they can evolve toward production-grade data handling without interfering with SHOPLINE session storage

## What The Minimal Backend API Supports Now

The new foundation routes are authenticated through the existing `/api/*` SHOPLINE validation middleware.

Current foundation routes:

- `GET /api/blind-box/pools`
- `POST /api/blind-box/pools`
- `POST /api/blind-box/pools/:blindBoxId/items`
- `GET /api/blind-box/product-mappings`
- `POST /api/blind-box/product-mappings`
- `GET /api/blind-box/assignments`
- `GET /api/blind-box/inventory-operations`

These routes are intentionally limited:

- they support early backend verification and data persistence
- they do not implement the final paid-order draw flow
- they do not expose customer-facing behavior

## What The Webhook Layer Does Now

The existing verified webhook entrypoint remains in place, but it now has foundation persistence behavior:

- verified webhook payloads are recorded in `webhook_events`
- event IDs are derived from known headers or a deterministic payload fingerprint fallback
- starter topics are marked as processed or ignored
- unhandled topics are marked failed with explicit error state

This creates a safer base for later idempotent order-paid processing without implementing the final Blind Box draw logic yet.

## What Is Still Deferred

This phase does not yet implement:

- final weighted selection logic
- paid-order Blind Box assignment flow
- inventory decrement or reservation against SHOPLINE
- retry-safe assignment execution logic
- admin dashboard pages
- theme extension or storefront integration

That is intentional. This phase is only the backend foundation.

## Safe Verification For This Phase

This phase can be tested safely without changing the current SHOPLINE auth/session model.

### Compile check

Run:

```powershell
.\node_modules\.bin\tsc.cmd -p app\tsconfig.json --noEmit
```

Expected result:

- the backend TypeScript foundation compiles successfully

### Runtime boot check

Run the existing root workflow:

```powershell
npm run dev
```

Expected result:

- the SHOPLINE CLI dev flow still boots the app
- the backend initializes the separate blind-box database on startup
- the existing auth/session behavior still works as before

### Safe API checks after auth

Once the embedded app is authenticated, these checks are safe:

- `GET /api/blind-box/pools`
  should return an empty array initially
- `POST /api/blind-box/pools`
  should create a foundation blind box record
- `GET /api/blind-box/product-mappings`
  should return an empty array initially
- `GET /api/blind-box/inventory-operations`
  should return an empty array initially

## Next Backend Step

The exact next backend step is:

- implement the actual blind-box backend use cases on top of this foundation

That means:

1. add repository-backed workflows for creating and validating blind-box pools and items in more detail
2. add webhook topic routing for the real paid-order event that will trigger assignment
3. implement the first idempotent assignment orchestration service
4. implement the first inventory-operation workflow around the chosen assignment

The key rule remains unchanged:

- actual blind-box selection logic must stay entirely in the backend
- no assignment logic should move into the admin UI or future theme storefront
