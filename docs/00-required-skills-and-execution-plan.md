# Required Skills and Execution Plan

## Current Repository Baseline

This repository is currently a standard SHOPLINE CLI scaffold with these active parts:

- Root CLI project in `package.json` with `npm run dev`, `npm run dev:reset`, and `npm run build`
- Embedded backend in `app/` using Express, `@shoplineos/shopline-app-express`, and SQLite session storage
- Embedded merchant admin frontend in `web/` using React, Vite, App Bridge, and session-token based authenticated fetch
- Linked SHOPLINE app config in `shopline.app.toml` and `shopline.app.blindbox-test-01.toml`
- Workspace reservation for `extensions/*`, but no extension exists yet

What exists today is still scaffold-level:

- `app/src/index.ts` wires auth, one webhook endpoint, static asset serving, and one sample API route
- `app/src/shopline.ts` configures the embedded app, auth flow, and webhook auth helper
- `app/src/controller/webhook/index.ts` verifies webhooks and switches on a few sample topics
- `web/src` is a thin embedded admin shell with a sample page and authenticated fetch helper
- Current access scope is only `write_products`, which is sufficient for the sample scaffold but should not be assumed sufficient for the final blind-box product

This document defines the skills, architecture boundaries, and phased execution plan without changing runtime behavior yet.

## Skills Loaded For This Step

One explicit local skill was loaded:

- `vercel:react-best-practices`
  Project meaning: keep the embedded merchant dashboard typed, accessible, simple, and free of backend-only business logic.

No dedicated SHOPLINE-specific skill is installed in this environment, so the remaining required skills are internalized from the current repository structure and the app requirements:

- SHOPLINE CLI project architecture
  Project meaning: preserve the existing root `app/` and `web/` split and add storefront integration through `extensions/*` instead of inventing a parallel app structure.
- Embedded app authentication and session handling
  Project meaning: build all merchant-facing admin flows on top of the existing App Bridge and backend session validation pattern.
- Webhook verification and durable order processing
  Project meaning: extend the existing webhook entrypoint into a verified, idempotent processing pipeline for paid-order blind-box assignment.
- Inventory-safe allocation design
  Project meaning: assignment and stock reduction must be backend-owned, transaction-aware, auditable, and retry-safe.
- Weighted random selection design
  Project meaning: the backend must choose from only enabled, eligible, in-stock items and record enough audit data to explain the choice later.
- Theme extension separation
  Project meaning: storefront rendering belongs in a dedicated extension workspace, not inside the embedded admin app.

## Project Execution Principles

- Preserve the current SHOPLINE CLI scaffold as the foundation instead of replacing it.
- Implement blind-box logic backend-first. The admin UI and storefront should consume backend state, not define it.
- Treat order-line assignment as permanent once persisted. Webhook retries must return the same assignment and must never reroll.
- Separate session storage from business data. The existing `app/database.sqlite` is acceptable for local auth sessions, but blind-box domain state should be designed as durable production data.
- Ship in phases with tests at each phase. Do not jump straight to storefront polish before the paid-order pipeline is correct.
- Prefer explicit boundaries: controller -> service -> repository/integration -> database.
- Make failures observable. Every assignment attempt, retry, inventory adjustment, and webhook replay needs correlated logs.

## Code Quality Standards

- New blind-box modules should be strongly typed even though the scaffold backend is permissive today.
- Keep controllers thin. Request parsing, auth context extraction, and HTTP response shaping stay in controllers; business rules stay in services.
- Keep SHOPLINE API calls behind integration modules instead of scattering fetch calls through controllers.
- Use deterministic identifiers and idempotency keys for any assignment or inventory operation.
- Log structured context for every blind-box workflow:
  `shop`, `topic`, `webhook_event_id`, `order_id`, `order_line_id`, `pool_id`, `selected_item_id`, `attempt`, `result`
- Add tests for every rule that can change merchant inventory or customer outcomes.
- For frontend code, prefer small typed components, semantic HTML, and backend-driven data fetching.

## SHOPLINE App Architecture

### Current Shape

- Root CLI app orchestrates the project through `shopline app dev` and `shopline app build`
- `app/` is the authenticated server surface
- `web/` is the embedded merchant admin surface
- `extensions/*` is reserved for future storefront integration

### Target Shape For This Product

- `app/`
  Owns auth, webhook verification, blind-box domain logic, admin APIs, order assignment workflow, inventory reservation/reduction, and logging
- `web/`
  Owns embedded merchant dashboard screens for managing pools, products, items, rules, assignments, and operational visibility
- `extensions/<theme-extension-name>/`
  Owns customer-facing theme blocks or embeds for product-page presentation and storefront rendering

The backend remains the source of truth. Neither the embedded admin app nor the storefront extension should make business-critical blind-box decisions.

## SHOPLINE CLI Development Flow

The current repo already exposes the correct entrypoints:

- `npm run dev`
  Runs `shopline app dev` at the root and orchestrates the linked app config plus workspace dev commands
- `npm run dev:reset`
  Runs the same workflow with reset behavior
- `npm run build`
  Runs `shopline app build`

Relevant current config files:

- `shopline.app.toml`
- `shopline.app.blindbox-test-01.toml`
- `app/shopline.web.toml`
- `web/shopline.web.toml`

Execution guidance for later implementation:

- Keep using the root CLI flow as the primary dev entrypoint
- Add future extension workspaces under `extensions/*` so the root CLI and workspaces remain the single source of orchestration
- Do not mutate scopes, webhook subscriptions, or callback URLs casually; document those changes before making them
- Keep local and production environment requirements explicit and versioned

## Embedded App Architecture

The current embedded architecture is already visible in the scaffold:

- Backend:
  `app/src/index.ts` handles auth routes, webhook route, authenticated `/api/*`, and frontend serving
- Auth/session:
  `app/src/shopline.ts` configures embedded auth and session storage
- Frontend:
  `web/src/hooks/useAppBridge.ts` and `web/src/hooks/useAuthenticatedFetch.ts` show the embedded admin auth pattern

For the blind-box product, the embedded app should evolve into:

- Dashboard routes for pool management, product mappings, item definitions, assignment logs, and operational errors
- Authenticated admin APIs under `/api/*`
- Shared backend validation for every admin mutation
- No direct secret handling in the browser beyond session-token based authenticated calls

## Theme App Extension Architecture

There is no theme extension in this repository yet. The root workspace already reserves `extensions/*`, so the correct future direction is to add storefront integration there instead of putting storefront code in `web/`.

Theme extension responsibilities:

- Render customer-facing blind-box merchandising on product and storefront surfaces
- Display presentation-only data such as title, imagery, pool messaging, rarity hints if allowed by product design, and post-purchase status if appropriate
- Read backend-prepared public data or safe storefront configuration

Theme extension must not:

- Select the winning item
- Hold admin credentials, app secrets, or signed inventory authority
- Decide item eligibility
- Perform authoritative inventory reduction
- Store the permanent order-line assignment

## Webhook Handling And Verification

The current scaffold already verifies webhooks through `shopline.webhookAuthentication(_req)` in `app/src/controller/webhook/index.ts`. That pattern should be preserved and extended.

Required production behavior:

- Accept the raw request body needed for platform verification
- Verify the webhook before touching domain state
- Persist a webhook event record before or during processing so retries and duplicate deliveries can be detected
- Route only the payment-confirmed order event into blind-box assignment logic
- Return a clear success or failure response with logs tied to the event and order identifiers

Recommended handling model:

1. Verify webhook authenticity
2. Extract a stable event identifier and business identifiers
3. Upsert a webhook event processing record
4. If already processed successfully, acknowledge and exit
5. If not processed, run the paid-order assignment workflow
6. Persist the result and processing outcome

The webhook controller should eventually become a thin ingress layer. Business processing belongs in dedicated services.

## Idempotent Order Processing

Blind-box assignment must be idempotent at the order-line level.

Required rule:

- A given paid blind-box order line can produce at most one permanent assignment

Consequences:

- Duplicate webhook deliveries must return the same result
- Manual retries must not create a second assignment
- Inventory retry flows must continue from the same assigned item, not pick a new one

Recommended idempotency keys:

- `shop_id + order_id + order_line_id`
- Also store webhook event identity separately for delivery-level deduplication

Recommended state model:

- `received`
- `assigned_pending_inventory`
- `inventory_committed`
- `inventory_retry_required`
- `failed_manual_attention`

Once the assignment row exists, rerolling is forbidden.

## Inventory-Safe Blind Box Assignment Logic

This is the highest-risk part of the system and must stay entirely in the backend.

Required business rule:

- Only enabled and in-stock items are eligible
- Exactly one item is selected after a valid paid order
- The selected item is permanently attached to that order line
- Chosen item inventory is reduced safely

Recommended backend sequence:

1. Start a transaction or equivalent processing lock for the order line
2. Check whether an assignment already exists
3. Resolve the blind-box product mapping to a pool
4. Build the eligible item set using:
   enabled flag, effective inventory, and any business constraints
5. Select one item using the configured strategy
6. Persist the assignment immediately
7. Create or update an inventory reservation/reduction record for the chosen item
8. Call the SHOPLINE inventory adjustment integration with an idempotency-aware reference
9. Mark the assignment and inventory operation status

Important failure rule:

- If inventory reduction fails after assignment persistence, keep the same assignment and retry or escalate. Do not reroll to another item.

To stay concurrency-safe, the system should maintain its own authoritative allocation records instead of relying on frontend checks or naive one-off inventory reads.

## Weighted Random Selection Logic

Selection strategy should be stored per pool:

- `uniform`
- `weighted`

Eligibility filter:

- Item is enabled
- Item has effective allocatable inventory greater than zero
- Item belongs to the mapped pool

Weighted mode design:

- Each eligible item has a positive weight value
- The backend calculates cumulative weight across the eligible set
- A secure backend random number determines the winning bucket

Uniform mode design:

- All eligible items are treated equally

Auditability requirements:

- Store the pool id and chosen item id
- Store the selection mode used
- Store a snapshot or summary of the eligible set used at draw time
- Store the random value or ticket position used for the decision
- Store total eligible count and total weight

The frontend must never generate or influence the random result.

## Backend Service Design

The existing scaffold already hints at a controller/service split through `app/src/controller/*` and `app/src/service/*`. The blind-box backend should deepen that pattern.

Recommended future structure inside `app/src`:

- `controller/`
  HTTP ingress only
- `service/`
  Blind-box orchestration, assignment engine, inventory workflow, admin commands
- `repository/`
  Database reads and writes for pools, mappings, assignments, webhook events, reservations
- `integration/shopline/`
  Admin API and inventory operations
- `domain/`
  Selection rules, eligibility rules, status models, validation
- `lib/`
  logger, ids, db client, errors, config

Key backend services:

- product-to-pool mapping service
- pool item management service
- paid-order blind-box assignment service
- inventory reservation/reduction service
- webhook event processor
- admin read-model service for dashboard visibility

## Database Schema Design

Current state:

- `app/database.sqlite` exists for session storage through `SQLiteSessionStorage`

Blind-box business state should not rely on session storage tables alone. A production-grade design needs explicit domain tables.

Recommended domain entities:

- `shops`
  merchant/store identity and settings
- `blind_box_pools`
  each logical prize pool
- `blind_box_product_mappings`
  mapping from sellable blind-box product or variant to a pool
- `blind_box_pool_items`
  eligible items, enabled flag, weight, inventory source reference
- `webhook_events`
  deduplication and processing log for incoming webhook deliveries
- `order_line_assignments`
  one permanent chosen item per paid blind-box order line
- `inventory_operations`
  reservation/reduction attempts, statuses, correlation ids, retry info
- `assignment_audit_logs`
  optional detailed trace of selection input and result

Minimum uniqueness guarantees:

- one mapping target per intended blind-box product context
- one assignment per `shop_id + order_id + order_line_id`
- one processed webhook record per unique delivery identifier

Production note:

- For launch, domain data should live in a durable production database with migrations. The current SQLite session store is acceptable for local scaffold behavior but should not be treated as the production blind-box persistence strategy.

## Admin Dashboard Architecture

Current state:

- `web/` is a thin embedded React app with routing and authenticated fetch

Target admin dashboard responsibilities:

- Manage blind-box pools
- Manage items inside each pool
- Map a blind-box product to a pool
- Configure uniform vs weighted selection
- Show assignment history and order-line outcome details
- Show failed inventory operations and retry status
- Show webhook processing visibility and operational logs

Admin dashboard constraints:

- Admin UI sends authenticated commands to backend APIs only
- Admin UI validates forms for user experience, but backend remains authoritative
- Admin UI never computes winners, never reduces inventory, and never stores secrets

Suggested page groups:

- overview
- pools
- product mappings
- assignments
- operations and failures

## Theme Storefront Block Or App Embed Design

The storefront surface should be delivered through a future extension workspace under `extensions/*`.

Storefront responsibilities:

- Present the blind-box product experience to customers
- Show configured marketing copy, pool imagery, and safe descriptive metadata
- Render any post-purchase reveal state only if the business flow requires it and the backend exposes it safely

Backend responsibilities for storefront support:

- expose safe public or signed read models where needed
- prepare any display metadata required by the theme
- keep private business logic off the storefront surface

What belongs in each layer:

- Backend:
  selection, inventory operations, idempotency, persistence, webhook processing, admin APIs, secure storefront data preparation
- Admin UI:
  merchant configuration, dashboards, operational visibility, manual retry commands
- Theme storefront:
  presentation, safe read-only customer experience, theme-configurable blocks or embeds

## What Must Never Be Implemented On The Frontend

- Winner selection logic
- Weighted random number generation for authoritative assignment
- Inventory decrement or inventory authority
- Webhook verification
- Permanent assignment writes
- Idempotency enforcement
- App secrets, admin tokens, or signing keys
- Retry decision logic that can alter a chosen item

This prohibition applies to both the embedded admin frontend and the customer-facing theme frontend.

## Testing Strategy

The repository does not currently contain a dedicated first-party test setup for blind-box logic. Testing must be introduced as part of the implementation phases.

Required test layers:

- Unit tests
  selection logic, eligibility filtering, weight math, state transitions, retry rules
- Integration tests
  webhook verification flow, paid-order processing service, repository behavior, inventory operation transitions
- Concurrency tests
  duplicate webhook deliveries, repeated order-line processing, competing inventory consumption
- Admin UI tests
  basic route rendering, form behavior, API contract expectations
- Manual end-to-end validation
  local CLI dev flow, embedded admin behavior, webhook replay handling, storefront rendering once extension exists

Minimum critical fixtures:

- duplicate paid-order webhook delivery
- order with non-blind-box items
- pool with disabled items
- pool with zero effective inventory
- weighted pool with expected distribution shape
- inventory reduction failure after assignment persistence

## Deployment Readiness

A deployment-ready blind-box app needs more than the current scaffold.

Required readiness items:

- production database for blind-box domain state
- migration strategy
- explicit environment variable contract
- documented required SHOPLINE scopes and webhook subscriptions
- structured logs with correlation ids
- replay-safe webhook handling
- inventory failure recovery path
- admin visibility into failed assignments and retries
- build and release process tied to the existing SHOPLINE CLI project

Current repo implications:

- The root CLI flow should remain the deployment entrypoint
- `app/` and `web/` already have build commands wired through their `shopline.web.toml` files
- A future extension workspace should join that same build pipeline rather than being deployed separately by ad hoc scripts

## Documentation Standards

All future work should be documented in small, durable documents tied to the actual repo structure.

Required documentation outputs during implementation:

- architecture notes when introducing new modules or persistence choices
- environment variable manifest
- webhook topic and processing contract
- database schema and migration notes
- retry and failure runbook
- admin API contracts
- storefront integration notes for the future extension workspace

Documentation rules:

- Prefer repo-relative paths and actual file names
- Record decisions before changing scopes, webhook subscriptions, or deployment behavior
- Keep examples aligned with the current `app/`, `web/`, and future `extensions/*` structure
- Update docs as phases complete so the repo remains operable by another engineer

## Phased Implementation Plan

### Phase 0: Planning

- Complete this architecture and execution baseline

### Phase 1: Backend Foundation

- Introduce blind-box domain schema and persistence
- Add structured logging and webhook event recording
- Define backend modules and admin API contracts
- Add tests for domain rules and idempotency

### Phase 2: Paid-Order Processing Core

- Implement payment-confirmed order processing
- Implement permanent order-line assignment flow
- Implement inventory reservation/reduction tracking
- Add retry-safe operational behavior

### Phase 3: Embedded Admin Dashboard

- Build pool management
- Build product mapping management
- Build operational visibility for assignments and failures

### Phase 4: Theme Storefront Integration

- Add a dedicated extension workspace under `extensions/*`
- Build customer-facing theme blocks or embeds
- Connect storefront rendering to safe backend-backed data

### Phase 5: Hardening And Launch Readiness

- Complete deployment prerequisites
- Review scopes and webhook subscriptions
- Complete end-to-end verification, failure drills, and documentation

## Next Best Implementation Step

The next best implementation step is Phase 1 backend foundation work:

- define the blind-box domain schema
- choose the durable production persistence strategy for domain data
- design the paid-order webhook processing contract
- create the backend module skeleton for mappings, pools, assignments, webhook events, and inventory operations

That step should happen before admin UI expansion or storefront extension work, because every other surface depends on correct backend ownership of assignment state.
