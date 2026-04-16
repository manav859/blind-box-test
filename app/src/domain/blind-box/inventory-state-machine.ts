import { BlindBoxAssignmentStatus, InventoryOperationStatus } from './status';

export const INVENTORY_WORKFLOW_STATE_MACHINE = 'inventory_commit_v2';

export const INVENTORY_OPERATION_EXECUTABLE_STATUSES = ['pending', 'failed'] as const;

export const INVENTORY_OPERATION_TERMINAL_STATUSES = ['succeeded', 'cancelled'] as const;

export const INVENTORY_OPERATION_STATE_TRANSITIONS: Record<
  InventoryOperationStatus,
  readonly InventoryOperationStatus[]
> = {
  pending: ['processing'],
  processing: ['processing', 'succeeded', 'failed'],
  succeeded: [],
  failed: ['processing'],
  cancelled: [],
};

export const ASSIGNMENT_STATUS_BY_INVENTORY_OPERATION_STATUS: Partial<
  Record<InventoryOperationStatus, BlindBoxAssignmentStatus>
> = {
  pending: 'inventory_pending',
  processing: 'inventory_processing',
  succeeded: 'inventory_committed',
  failed: 'inventory_failed',
};

export function canExecuteInventoryOperation(status: InventoryOperationStatus): boolean {
  return INVENTORY_OPERATION_EXECUTABLE_STATUSES.includes(
    status as (typeof INVENTORY_OPERATION_EXECUTABLE_STATUSES)[number],
  );
}

export function isInventoryOperationTerminal(status: InventoryOperationStatus): boolean {
  return INVENTORY_OPERATION_TERMINAL_STATUSES.includes(
    status as (typeof INVENTORY_OPERATION_TERMINAL_STATUSES)[number],
  );
}

export function isRecoverableMissingInventoryBoundaryAssignmentStatus(
  status: BlindBoxAssignmentStatus,
): boolean {
  return ['pending', 'assigned', 'inventory_pending', 'inventory_failed'].includes(status);
}
