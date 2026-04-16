# Inventory State Machine

Date: 2026-04-13

## Purpose

This document defines the explicit state machine used at the assignment-to-inventory boundary.

Implementation references:

- `app/src/domain/blind-box/inventory-state-machine.ts`
- `app/src/service/inventory/assignment-inventory-boundary-service.ts`
- `app/src/service/inventory/inventory-execution-service.ts`
- `app/src/repository/inventory-execution-repository.ts`
- `app/src/service/webhook/paid-order-webhook-service.ts`

## Core Principle

The state machine is built around one invariant:

- the blind-box assignment is immutable once persisted

Everything after that point operates on:

- the same assignment id
- the same selected pool item id
- the same commit inventory operation id

Retries and webhook replays move the existing workflow forward. They do not create a new assignment.

## Entities

### 1. Assignment

Table:

- `blind_box_assignments`

Relevant states in this phase:

- `inventory_pending`
- `inventory_processing`
- `inventory_committed`
- `inventory_failed`

Legacy states still exist in the schema but are not the focus of this phase:

- `pending`
- `assigned`

### 2. Inventory Operation

Table:

- `inventory_operations`

Relevant operation type:

- `commit`

States:

- `pending`
- `processing`
- `succeeded`
- `failed`
- `cancelled`

In this phase, `cancelled` is defined in the schema but not used by the blind-box workflow.

### 3. Webhook Event

Table:

- `webhook_events`

Relevant states:

- `received`
- `processing`
- `processed`
- `ignored`
- `failed`

## State Transitions

### Assignment Transitions

Allowed workflow transitions in this phase:

- `inventory_pending -> inventory_processing`
- `inventory_processing -> inventory_committed`
- `inventory_processing -> inventory_failed`
- `inventory_failed -> inventory_processing`

Operational recovery transition:

- `inventory_failed -> inventory_pending`

That recovery transition only happens when the backend repairs a missing inventory-operation boundary for an existing assignment.

### Inventory Operation Transitions

Defined in `inventory-state-machine.ts`:

- `pending -> processing`
- `processing -> succeeded`
- `processing -> failed`
- `processing -> processing`
- `failed -> processing`

Meaning of `processing -> processing`:

- the external inventory call finished in an indeterminate state
- the backend preserves `processing` to block unsafe duplicate retries

Terminal operation states for retry purposes:

- `succeeded`
- `cancelled`

Executable operation states:

- `pending`
- `failed`

## Normal Success Flow

### Step 1. Assignment Boundary Persistence

The backend persists these together:

- assignment state = `inventory_pending`
- inventory operation state = `pending`

This happens before any live inventory mutation begins.

### Step 2. Execution Starts

When execution begins:

- assignment = `inventory_processing`
- inventory operation = `processing`

### Step 3. Execution Succeeds

On successful SHOPLINE mutation:

- assignment = `inventory_committed`
- inventory operation = `succeeded`
- webhook event = `processed`

## Deferred Flow

When runtime mode is `deferred`:

- assignment remains `inventory_pending`
- inventory operation remains `pending`
- webhook event becomes `processed`

Interpretation:

- the immutable assignment exists
- the inventory boundary is recorded
- live mutation has not started yet

## Definitive Failure Flow

When the gateway returns a definitive failure after execution started:

- assignment = `inventory_failed`
- inventory operation = `failed`
- webhook event = `failed`

Additional behavior:

- locally reserved pool-item quantity is released
- the assignment does not reroll
- the same inventory operation can be retried later

## Indeterminate Flow

When the backend cannot prove whether the external mutation committed:

- assignment = `inventory_processing`
- inventory operation = `processing`
- webhook event = `failed`

This is the protected reconciliation state.

Meaning:

- the backend does not know whether SHOPLINE committed the adjustment
- auto-retrying would risk a second mutation
- retry calls return `processing` until an operator resolves the situation

## Retry Rules

### Retrying A Failed Operation

Allowed.

Transition:

- `failed -> processing -> succeeded|failed`

Guarantees:

- same assignment id
- same selected pool item id
- same inventory operation id
- same idempotency key at the backend boundary

### Retrying A Pending Operation

Allowed.

This supports:

- deferred-to-execute progression
- replay recovery when assignment exists and execution has not started

### Retrying A Processing Operation

Blocked.

Returned outcome:

- `processing`

Reason:

- reconciliation is required first

### Retrying A Succeeded Operation

Safe noop.

Returned outcome:

- `noop`

Reason:

- the persisted operation is already terminally successful

## Webhook State Machine Interaction

### No Blind-Box Match

- webhook event -> `ignored`

### Successful Blind-Box Processing

- webhook event -> `processed`

### Inventory Failure

- webhook event -> `failed`

### Replay Of A Terminally Successful Event

If the event is already `processed` or `ignored`:

- response status = `duplicate`
- no state change in assignment or inventory

### Replay Of A Failed Event

If the event is `failed`:

- it may re-enter `processing`
- assignment and inventory state decide whether the event can settle

Outcomes:

- if inventory is still failed, webhook returns to `failed`
- if recovery already succeeded, webhook can move to `processed`

## Partial Success And Partial Failure Boundaries

There are two critical boundaries in this phase.

### Boundary 1. Before Inventory Execution Starts

Protected by transactional persistence:

- assignment record exists
- pending inventory operation exists

This is now recoverable without losing auditability.

### Boundary 2. After Inventory Execution Starts But Before Final Confirmation

Protected by `processing` state:

- local reservation already happened
- external mutation may or may not have happened
- backend refuses unsafe duplicate retries

This is the explicit manual-reconciliation boundary.

## Audit Trail Fields

### Assignment

Recorded:

- immutable selected pool item
- current assignment status
- selection and inventory summary metadata

### Inventory Operation

Recorded:

- one operation per assignment and operation type
- attempt count
- last attempted time
- processing start time
- completion time on success or definitive failure
- reason
- metadata including attempt history and gateway boundary description

### Webhook Event

Recorded:

- event id
- topic
- current webhook processing status
- last failure summary when applicable

## Live Versus Boundary Summary

Live and implemented:

- transactional assignment plus pending-operation persistence
- retry-safe execution state machine
- explicit `pending/processing/succeeded/failed` operation states
- SHOPLINE gateway code path

Still dependent on store/platform setup:

- valid SHOPLINE access token availability
- final required scopes
- correct source ids on pool items
- location resolution in the connected store

## Practical Operator Interpretation

- `inventory_pending`: assignment is durable, execution has not started
- `inventory_processing`: do not blindly retry, reconcile first
- `inventory_committed`: workflow is complete
- `inventory_failed`: safe retry path exists and will reuse the same assignment

This is the exact state model the future admin retry tooling should target.
