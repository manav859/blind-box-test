# Live-Store Inventory Validation

Date: 2026-04-13

## Purpose

This document explains the live-store validation layer added for the current private-app/store phase.

The goal of this phase is not to add new storefront behavior. The goal is to prove that the backend can tell the difference between:

- a blind-box pool item that is actually executable in the connected SHOPLINE store
- a pool item that still has missing scope, identifier, inventory, or location configuration

## What Was Added

### Backend Readiness Validation

New service:

- `app/src/service/inventory/inventory-execution-readiness-service.ts`

New gateway validation contract:

- `app/src/integration/shopline/inventory-gateway.ts`

The readiness layer now validates execute-mode prerequisites before a live inventory mutation starts.

### New Read-Only Validation Endpoints

New backend endpoints:

- `GET /api/blind-box/pool-items/:poolItemId/execution-readiness`
- `GET /api/blind-box/inventory-operations/:operationId/execution-readiness`

These endpoints do not mutate inventory.

They return a readiness report for:

- current configured scopes
- current execute-mode runtime config
- resolved identifiers
- inventory tracking state
- inventory-level linkage at the target location

## Exact Execute-Mode Checks

The execute path now fails clearly before mutation when any of these are missing.

### 1. Configured Scopes

The backend now requires these scopes for execute mode:

- `read_products`
- `read_inventory`
- `read_location`
- `write_inventory`

The backend reads the configured scope set from `SCOPES` and fails fast if any are missing.

### 2. Access Token Availability

Execute mode also requires:

- a current admin session access token, or
- a stored usable SHOPLINE session token for the shop

If that token is missing, readiness fails clearly instead of proceeding into a fake success path.

### 3. Pool-Item Source Identifiers

A pool item must provide inventory-executable source linkage:

- `sourceVariantId`, or
- `sourceProductId` when the product resolves to exactly one variant

If a product has multiple variants and no `sourceVariantId` is provided:

- readiness fails with `SHOPLINE_VARIANT_REQUIRED`

### 4. Inventory Item Resolution

The gateway resolves the assignment-time source ids into live execution ids:

- source product id
- source variant id
- resolved variant id
- inventory item id

If the resolved variant or product does not expose an inventory item:

- readiness fails clearly

### 5. Location Resolution

The gateway now verifies location resolution explicitly.

Current behavior:

- if `BLIND_BOX_SHOPLINE_LOCATION_ID` is set, that location must exist among active store locations
- otherwise the backend looks for a default location
- otherwise the backend accepts a single active location
- otherwise execute mode is not ready

Failure codes include:

- `SHOPLINE_LOCATION_CONFIGURED_NOT_FOUND`
- `SHOPLINE_LOCATION_UNRESOLVED`

### 6. Inventory State Validation

Before execute mode is treated as ready, the gateway now validates:

- the inventory item is tracked
- the inventory item is linked to the target location through an inventory level
- the target location reports at least the quantity required for the blind-box execution attempt

Failure codes include:

- `SHOPLINE_INVENTORY_NOT_TRACKED`
- `SHOPLINE_INVENTORY_INSUFFICIENT`
- `SHOPLINE_INVENTORY_LEVEL_MISSING`

## Identifier Model

### Assignment-Time Identifiers

These are configured on the blind-box pool item and persisted in backend records:

- `sourceProductId`
- `sourceVariantId`

These are merchant-managed source identifiers. They are not the final execution identifiers.

### Inventory-Execution Identifiers

These are resolved at validation and execute time:

- resolved variant id
- inventory item id
- location id

The backend now treats these as distinct from assignment-time source ids.

## How Execute Mode Uses Validation

### Before This Phase

The backend could reach the gateway and fail only after entering execution logic.

### After This Phase

The backend first validates readiness.

If validation is not ready:

- the inventory operation is marked `failed`
- the assignment is marked `inventory_failed`
- the failure reason is operator-readable
- no live inventory mutation is attempted

If validation is ready:

- execution proceeds through the normal commit flow

## Local Testing

### Backend Tests

From `app/`:

```powershell
npm run build
npm test
```

Current test coverage includes:

- missing scope handling
- missing location handling
- missing variant or inventory linkage handling
- ready validation path
- retry after configuration is fixed

### Safe Local Runtime Verification

From repo root:

```powershell
npm run dev
```

Then verify:

1. the SHOPLINE CLI flow still starts
2. the embedded app still authenticates
3. existing blind-box admin flows still work
4. validation endpoints respond through the authenticated backend

## Connected Store Validation Procedure

### Step 1. Confirm Scope Update Is Live

Confirm the private app has been reauthorized or reinstalled after the scope config change.

Do not assume the current token has the new scopes just because the repo file changed.

### Step 2. Configure A Test Pool Item

For one pool item used in execute mode, set:

- `sourceVariantId` directly when possible
- or `sourceProductId` only if the product has exactly one variant

### Step 3. Confirm Location Strategy

Either:

- set `BLIND_BOX_SHOPLINE_LOCATION_ID`, or
- confirm the store has a unique default or single active location

### Step 4. Run Validation Endpoint

Use:

```text
GET /api/blind-box/pool-items/:poolItemId/execution-readiness
```

Expected ready result:

- `status = ready`
- no missing scopes
- resolved `inventoryItemId`
- resolved `locationId`
- `tracked = true`
- inventory level found for that location

### Step 5. Validate Failed Operations Before Retrying

For a failed recorded operation, use:

```text
GET /api/blind-box/inventory-operations/:operationId/execution-readiness
```

This is the safer path before clicking or calling retry tooling.

### Step 6. Execute A Real Store Flow

Only after readiness returns `ready`:

1. set `BLIND_BOX_INVENTORY_EXECUTION_MODE=execute`
2. place a paid order for the mapped blind-box product
3. verify:
   - assignment = `inventory_committed`
   - inventory operation = `succeeded`
   - webhook event = `processed`
   - store inventory changed for the resolved source item

## What Must Be Confirmed Before Theme Extension Work

All of the following must be true first:

- the private app has the updated scopes in the connected store
- the validation endpoint returns `ready` for the intended execute-mode pool items
- a real execute-mode paid-order flow succeeds in the connected store
- failures are understandable enough that an operator knows whether to retry or reconfigure

Theme extension work should not start before those validations are complete.
