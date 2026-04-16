# Current State Verification Report

Date: 2026-04-13

## Scope

This verification pass reviewed the current repository state only for the implemented backend and embedded admin dashboard phases.

It covered:

- backend controllers, services, repositories, domain logic, and schema
- embedded admin pages, hooks, components, and frontend/backend contracts
- current config and phase docs
- safe repo checks already supported by the project

The worktree was already dirty before this pass, mainly in the admin-dashboard area. This report treats those files as the current candidate implementation rather than a clean historical baseline.

## What Is Implemented And Verified

### Backend

Verified in code:

- separate blind-box persistence exists alongside SHOPLINE session storage
  - session DB remains `app/database.sqlite` in `app/src/shopline.ts`
  - blind-box domain DB defaults to `app/blind-box-domain.sqlite` in `app/src/lib/config.ts`
  - blind-box persistence is initialized at app startup in `app/src/index.ts`
- verified webhook entrypoint exists at `POST /api/webhooks`
- `orders/paid` is registered in `app/src/shopline.ts` and routed in `app/src/controller/webhook/index.ts`
- product-mapping-based blind-box order detection is implemented in `app/src/domain/blind-box/order-detection.ts`
- backend-only uniform and weighted selection is implemented in `app/src/domain/blind-box/selection.ts`
- assignment idempotency is enforced by:
  - `shop + order_id + order_line_id`
  - `idempotency_key`
  - schema uniqueness constraints in `app/src/db/schema/initial-foundation.ts`
- webhook duplicate protection is implemented through `webhook_events` and terminal duplicate handling in `app/src/service/webhook/paid-order-webhook-service.ts`
- deferred inventory behavior is implemented
  - runtime default remains `deferred`
  - assignments stay `inventory_pending`
  - inventory operations are recorded as `pending`
- failure state persistence exists in:
  - `webhook_events.error_message`
  - `blind_box_assignments.metadata`
  - `inventory_operations.reason`
  - structured logs

### Admin Dashboard

Verified in code:

- embedded-safe navigation preserves SHOPLINE query params through `useEmbeddedPath` and `useEmbeddedNavigate`
- authenticated admin API wrapper exists in `web/src/hooks/useBlindBoxAdminApi.ts`
- page-level async loading and retry states exist via `useResource`
- implemented pages:
  - `/` redirect
  - `/blind-box/pools`
  - `/blind-box/pools/new`
  - `/blind-box/pools/:blindBoxId`
  - `/blind-box/assignments`
  - `/blind-box/failures`
- create and edit blind-box flow is implemented
- pool item add and edit flow is implemented
- product mapping add and edit flow is implemented
- assignment history display is implemented
- failure log display is implemented for assignment failures and inventory-operation failures
- loading, empty, and error states are present across the main dashboard pages

### Backend And Frontend Contract

Verified:

- backend admin routes currently exposed in `app/src/controller/admin/blind-box/index.ts`
  - `GET /pools`
  - `POST /pools`
  - `PUT /pools/:blindBoxId`
  - `GET /pools/:blindBoxId/items`
  - `POST /pools/:blindBoxId/items`
  - `GET /product-mappings`
  - `POST /product-mappings`
  - `GET /assignments`
  - `GET /inventory-operations`
- frontend hook methods in `web/src/hooks/useBlindBoxAdminApi.ts` match that surface
- the current contract intentionally depends on `/api/*` being parsed as text and then JSON-decoded in backend controllers
  - this is unusual, but it is consistent between `app/src/index.ts`, `app/src/lib/http.ts`, and the frontend request wrapper

## What Passed

### Static And Build Checks

Passed:

- `app`: `npm run build`
- `web`: `npm run build`
- repo root: `npm run build`
  - this successfully ran `shopline app build`

### Backend Automated Tests

Passed:

- `app`: `npm test`
- note:
  - the first sandboxed run failed with `spawn EPERM` from Node's test runner
  - rerunning the same repo test command outside the sandbox passed cleanly

### Directly Verified Test Coverage

Confirmed by inspected tests:

- order detection
- disabled variant-specific mapping behavior
- uniform selection
- weighted selection
- out-of-stock filtering
- duplicate processed webhook handling
- immutable assignment behavior
- no-eligible-item failure
- inventory workflow failure recording
- retry regression after inventory failure

## What Could Not Be Verified Directly

Not directly verified in this pass:

- a live authenticated `npm run dev` embedded SHOPLINE admin session
- private app installation status inside the store admin UI
- real `orders/paid` delivery from SHOPLINE into this local app
- real inventory mutation against SHOPLINE APIs
- merchant-facing runtime behavior under an actual store order replay

These areas were only verified through code inspection, config review, and automated tests.

## Mismatches Between Frontend And Backend

### Non-blocking Mismatches

- failure visibility is intentionally incomplete
  - the UI shows assignment and inventory failures
  - the backend does persist webhook failures
  - there is still no admin read API for `webhook_events`
  - result: the failure page cannot show webhook-event failures directly
- the edit screen fetches all blind boxes and filters client-side because there is no dedicated `GET /api/blind-box/pools/:blindBoxId` endpoint
  - functional today
  - less efficient than a single-resource API

### Capability Alignment

The main admin UI otherwise matches current backend capability reasonably well:

- create and update only, not delete
- read-only assignments
- read-only failure visibility
- raw product and variant ID entry instead of product pickers

That alignment is consistent with the current phase.

## Mismatches Between Docs And Code

### docs/04-phase-1-backend-foundation-implementation.md

This document is historically accurate for Phase 1 but not current as a full snapshot:

- it lists the original limited route surface
- current code now also includes:
  - `PUT /api/blind-box/pools/:blindBoxId`
  - `GET /api/blind-box/pools/:blindBoxId/items`

### docs/05-phase-2-paid-order-webhook-and-assignment.md

Current code has moved beyond one statement in this document:

- the document says Phase 2 still does not build admin dashboard pages
- current repo now contains the admin dashboard in `web/` plus supporting backend admin routes

This is understandable as a phase-scoped document, but it is no longer a current-state description by itself.

### docs/06-assignment-flow.md

Current code partially supersedes one placeholder statement:

- the document lists dashboard visibility and recovery UI as placeholder
- current repo now has dashboard visibility for assignments and some failures
- recovery UI is still placeholder

### docs/30-admin-dashboard.md

This document matches the current implementation well overall.

Confirmed matches include:

- implemented page set
- admin API usage
- explicit limitation that webhook event failures are not yet exposed by a read API
- recommendation that inventory integration is the next step

## Architectural Risks Found

### 1. Assignment And Inventory Boundary Is Still Not Transactionally Hardened

The assignment record and inventory-operation record are created in sequence, not as one atomic persisted workflow.

Risk:

- a process crash between assignment creation and inventory-operation creation could leave an immutable assignment without a matching inventory-operation record
- that would weaken recoverability and operational visibility

Current status:

- acceptable for the present phase
- should be hardened as inventory integration begins

### 2. Webhook Failure Visibility Is Incomplete

The backend persists webhook failures, but the admin surface cannot read them yet.

Risk:

- operators can miss failures that happen before assignment or inventory records are created

### 3. Inventory Eligibility Still Uses App-Managed Quantity Only

Eligibility is currently driven by persisted `inventoryQuantity` on pool items, not live SHOPLINE inventory.

Risk:

- configuration can drift from actual store inventory until real inventory integration is added

### 4. Recovery Tooling Is Still Absent

The current implementation records failure states but does not provide:

- webhook replay tooling
- retry buttons
- inventory recovery actions

That is consistent with the current phase, but it is the main operational gap before production-safe inventory work.

## UI Gaps Found

- no direct webhook failure screen
- no retry or replay actions
- no product or variant picker; raw IDs only
- no delete/archive actions for pool items or mappings from the dashboard
- failure reasons can appear as raw metadata strings rather than structured operator-friendly summaries

These are gaps, but they are not contradictions with the current backend phase.

## Corrections Made During This Pass

One high-confidence, low-risk backend fix was applied:

- execute-mode webhook retries no longer convert a previously failed inventory workflow into a `processed` webhook result without actual recovery

Files changed for that correction:

- `app/src/service/blind-box/paid-order-assignment-service.ts`
- `app/src/service/webhook/paid-order-webhook-service.test.ts`

Added regression coverage:

- repeat processing of the same failed inventory webhook now remains failed until recovery is explicitly handled

## Verification Steps Performed

1. Inspected repo structure, package scripts, current git status, and SHOPLINE config files.
2. Reviewed backend startup, webhook controller, admin controller, DB client, schema, repositories, services, and domain helpers.
3. Reviewed frontend routing, authenticated fetch layer, API wrapper, shared loading hook, admin pages, forms, tables, and types.
4. Cross-checked backend route surface against frontend API usage.
5. Compared the four requested docs against the current code.
6. Ran:
   - `app`: `npm run build`
   - `web`: `npm run build`
   - repo root: `npm run build`
   - `app`: `npm test`
7. Fixed one verified failure-path bug and reran the relevant checks.

## Readiness Assessment

### Backend

Assessment:

- solid for the current non-inventory-integrated phase
- idempotent assignment, duplicate handling, deferred inventory boundary, and admin read surface are all in place
- not yet production-hardened for live inventory execution or operational recovery

### Admin Dashboard

Assessment:

- solid for the current phase
- it is appropriately thin
- it does not overreach into backend-owned business logic
- it exposes the backend capabilities that actually exist today

## Is The Project Ready For The Next Phase?

Yes.

It is ready to proceed to the next phase, with the understanding that the next phase should harden the assignment-to-inventory boundary instead of starting theme extension work.

## Exact Recommended Next Phase

Proceed to **inventory integration and recovery hardening**.

Recommended scope for that phase:

1. connect the real SHOPLINE inventory gateway for commit or reservation flows
2. harden assignment and inventory-operation persistence so partial crashes are recoverable
3. expose webhook-event failures through an admin read API
4. add controlled retry or replay tooling for failed inventory and webhook flows
5. verify the whole path with a real or replayed `orders/paid` event in the private app/store setup

Do **not** start theme app extension work yet.
