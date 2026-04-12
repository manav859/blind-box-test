export const BLIND_BOX_STATUSES = ['draft', 'active', 'archived'] as const;
export type BlindBoxStatus = (typeof BLIND_BOX_STATUSES)[number];

export const BLIND_BOX_SELECTION_STRATEGIES = ['uniform', 'weighted'] as const;
export type BlindBoxSelectionStrategy = (typeof BLIND_BOX_SELECTION_STRATEGIES)[number];

export const BLIND_BOX_ASSIGNMENT_STATUSES = [
  'pending',
  'assigned',
  'inventory_pending',
  'inventory_committed',
  'inventory_failed',
] as const;
export type BlindBoxAssignmentStatus = (typeof BLIND_BOX_ASSIGNMENT_STATUSES)[number];

export const WEBHOOK_EVENT_STATUSES = ['received', 'processing', 'processed', 'ignored', 'failed'] as const;
export type WebhookEventStatus = (typeof WEBHOOK_EVENT_STATUSES)[number];

export const INVENTORY_OPERATION_TYPES = ['reserve', 'commit', 'release', 'adjustment'] as const;
export type InventoryOperationType = (typeof INVENTORY_OPERATION_TYPES)[number];

export const INVENTORY_OPERATION_STATUSES = ['pending', 'completed', 'failed', 'cancelled'] as const;
export type InventoryOperationStatus = (typeof INVENTORY_OPERATION_STATUSES)[number];
