# Inventory Operator Runbook

Date: 2026-04-13

## Purpose

This runbook explains how to interpret execute-mode failures and what an operator should do next.

It is written for the current backend phase only.

It does not include theme extension work.

## Core Rule

The blind-box assignment is immutable after persistence.

That means:

- never expect a retry to choose a new item
- every retry works on the same assignment and same inventory operation

## Safe Operator Sequence

When an inventory operation fails:

1. inspect the recorded assignment status
2. inspect the recorded inventory-operation status and reason
3. run the execution-readiness endpoint for that failed operation
4. only retry after the reported configuration or store issue is fixed

## Readiness Endpoints

### Validate A Pool Item Before Live Orders

```text
GET /api/blind-box/pool-items/:poolItemId/execution-readiness
```

Use this for:

- setup validation
- confirming a pool item is execute-ready before testing with a real order

### Validate A Failed Recorded Operation

```text
GET /api/blind-box/inventory-operations/:operationId/execution-readiness
```

Use this for:

- a failed operation that may become retryable after configuration is fixed

## Retry Endpoint

```text
POST /api/blind-box/inventory-operations/:operationId/retry
```

Use this only when:

- readiness validation returns `ready`, or
- the failure was clearly transient and the validation state is already understood

## Status Interpretation

### Assignment Status

- `inventory_pending`
  - assignment exists
  - execute mode has not started
  - safe to validate configuration before execution

- `inventory_processing`
  - do not blindly retry
  - the system may not know whether SHOPLINE already changed inventory
  - reconcile first

- `inventory_committed`
  - workflow finished successfully
  - retry is not needed

- `inventory_failed`
  - the assignment is preserved
  - retry may be appropriate after validation

### Inventory Operation Status

- `pending`
  - execution has not started
  - safe to validate and then execute

- `processing`
  - do not retry automatically
  - this is the reconciliation state

- `succeeded`
  - retry is a noop

- `failed`
  - retry can be safe, but only after the readiness issue is fixed

## Error Meaning And Action

### `SHOPLINE_CONFIGURED_SCOPES_MISSING`

Meaning:

- the current runtime scope set is missing execute-mode requirements

Action:

1. update app scopes
2. reauthorize or reinstall the private app
3. confirm the active token is refreshed
4. rerun readiness validation

Retry now:

- no

### `SHOPLINE_ACCESS_TOKEN_MISSING`

Meaning:

- the backend has no usable admin access token for the current shop

Action:

1. open the embedded app again in the connected store
2. ensure auth/session flow completes
3. rerun readiness validation

Retry now:

- no

### `SHOPLINE_SOURCE_PRODUCT_MISSING`

Meaning:

- the pool item has no usable source product or variant linkage

Action:

1. update the pool item configuration
2. set `sourceVariantId`, or a valid `sourceProductId`
3. rerun readiness validation

Retry now:

- no

### `SHOPLINE_VARIANT_REQUIRED`

Meaning:

- the source product has multiple variants and the pool item did not specify which variant should be decremented

Action:

1. set `sourceVariantId` explicitly on the pool item
2. rerun readiness validation

Retry now:

- no

### `SHOPLINE_VARIANT_INVENTORY_ITEM_MISSING`

Meaning:

- the resolved product or variant no longer exposes an inventory item for execute mode

Action:

1. verify the source item still exists
2. verify it is inventory-backed in SHOPLINE
3. rerun readiness validation

Retry now:

- no

### `SHOPLINE_LOCATION_UNRESOLVED`

Meaning:

- the backend could not pick a safe location automatically

Action:

1. set `BLIND_BOX_SHOPLINE_LOCATION_ID`, or
2. simplify or fix store location state so a unique active/default location exists
3. rerun readiness validation

Retry now:

- no

### `SHOPLINE_LOCATION_CONFIGURED_NOT_FOUND`

Meaning:

- the configured location id does not match an active store location

Action:

1. correct `BLIND_BOX_SHOPLINE_LOCATION_ID`
2. rerun readiness validation

Retry now:

- no

### `SHOPLINE_INVENTORY_NOT_TRACKED`

Meaning:

- the resolved inventory item is not tracked in SHOPLINE

Action:

1. enable inventory tracking for that item
2. rerun readiness validation

Retry now:

- no

### `SHOPLINE_INVENTORY_LEVEL_MISSING`

Meaning:

- the inventory item is not linked to the target location

Action:

1. connect the inventory item to the intended location in SHOPLINE
2. rerun readiness validation

Retry now:

- no

### `SHOPLINE_INVENTORY_NETWORK_ERROR`

Meaning:

- the validation or mutation failed before a reliable response was received

Action:

1. check connectivity
2. rerun readiness validation first
3. retry only after validation returns `ready`

Retry now:

- maybe, but validate first

### `SHOPLINE_INVENTORY_HTTP_ERROR`

Meaning:

- SHOPLINE returned an explicit API error

Action:

1. inspect scopes, identifiers, and store configuration
2. check response details and trace ids in logs or stored metadata
3. rerun readiness validation

Retry now:

- no, not until the cause is understood

## What Should Not Be Retried Blindly

Do not blindly retry when:

- operation status is `processing`
- scope or token configuration is missing
- location is unresolved
- source ids are incomplete
- inventory tracking is disabled
- inventory level linkage is missing

## What Is Safe To Retry

Retry is generally safe when:

- the operation status is `failed`
- readiness validation now returns `ready`
- the failure was caused by a corrected configuration issue, not by an unresolved `processing` state

## Local And Connected-Store Verification

### Local

From `app/`:

```powershell
npm run build
npm test
```

From repo root:

```powershell
npm run dev
```

### Connected Store

1. validate one execute-mode pool item
2. run one real paid-order execute flow
3. confirm success path end-to-end
4. intentionally validate one failure mode
5. confirm the failure report is understandable before any operator retry

## Before Theme Extension Work

Do not begin theme extension work until:

- scope changes are live in the connected store
- execute-mode validation returns `ready` for intended pool items
- one real execute-mode order succeeds
- the operator runbook above is confirmed usable in practice
