import {
  BlindBoxAssignmentStatus,
  BlindBoxSelectionStrategy,
  BlindBoxStatus,
  InventoryOperationStatus,
  InventoryOperationType,
  WebhookEventStatus,
} from './status';

export interface BlindBox {
  id: string;
  shop: string;
  name: string;
  description: string | null;
  status: BlindBoxStatus;
  selectionStrategy: BlindBoxSelectionStrategy;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBlindBoxInput {
  name: string;
  description?: string | null;
  status?: BlindBoxStatus;
  selectionStrategy?: BlindBoxSelectionStrategy;
}

export interface NormalizedCreateBlindBoxInput {
  name: string;
  description: string | null;
  status: BlindBoxStatus;
  selectionStrategy: BlindBoxSelectionStrategy;
}

export interface BlindBoxPoolItem {
  id: string;
  shop: string;
  blindBoxId: string;
  label: string;
  sourceProductId: string | null;
  sourceVariantId: string | null;
  enabled: boolean;
  weight: number;
  inventoryQuantity: number;
  metadata: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertBlindBoxPoolItemInput {
  id?: string;
  blindBoxId: string;
  label: string;
  sourceProductId?: string | null;
  sourceVariantId?: string | null;
  enabled?: boolean;
  weight?: number;
  inventoryQuantity?: number;
  metadata?: string | null;
}

export interface NormalizedUpsertBlindBoxPoolItemInput {
  id: string | null;
  blindBoxId: string;
  label: string;
  sourceProductId: string | null;
  sourceVariantId: string | null;
  enabled: boolean;
  weight: number;
  inventoryQuantity: number;
  metadata: string | null;
}

export interface BlindBoxProductMapping {
  id: string;
  shop: string;
  blindBoxId: string;
  productId: string;
  productVariantId: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertBlindBoxProductMappingInput {
  id?: string;
  blindBoxId: string;
  productId: string;
  productVariantId?: string | null;
  enabled?: boolean;
}

export interface NormalizedUpsertBlindBoxProductMappingInput {
  id: string | null;
  blindBoxId: string;
  productId: string;
  productVariantId: string | null;
  enabled: boolean;
}

export interface BlindBoxAssignment {
  id: string;
  shop: string;
  blindBoxId: string;
  orderId: string;
  orderLineId: string;
  selectedPoolItemId: string | null;
  status: BlindBoxAssignmentStatus;
  selectionStrategy: BlindBoxSelectionStrategy | null;
  idempotencyKey: string;
  metadata: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBlindBoxAssignmentInput {
  blindBoxId: string;
  orderId: string;
  orderLineId: string;
  selectedPoolItemId?: string | null;
  status: BlindBoxAssignmentStatus;
  selectionStrategy?: BlindBoxSelectionStrategy | null;
  idempotencyKey: string;
  metadata?: string | null;
}

export interface NormalizedCreateBlindBoxAssignmentInput {
  blindBoxId: string;
  orderId: string;
  orderLineId: string;
  selectedPoolItemId: string | null;
  status: BlindBoxAssignmentStatus;
  selectionStrategy: BlindBoxSelectionStrategy | null;
  idempotencyKey: string;
  metadata: string | null;
}

export interface WebhookEvent {
  id: string;
  shop: string;
  topic: string;
  eventId: string;
  status: WebhookEventStatus;
  payload: string;
  errorMessage: string | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecordWebhookEventInput {
  shop: string;
  topic: string;
  eventId: string;
  payload: string;
  status?: WebhookEventStatus;
}

export interface InventoryOperation {
  id: string;
  shop: string;
  blindBoxId: string | null;
  assignmentId: string | null;
  poolItemId: string | null;
  idempotencyKey: string;
  quantity: number;
  operationType: InventoryOperationType;
  status: InventoryOperationStatus;
  attemptCount: number;
  lastAttemptedAt: string | null;
  processingStartedAt: string | null;
  completedAt: string | null;
  externalReference: string | null;
  reason: string | null;
  metadata: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInventoryOperationInput {
  blindBoxId?: string | null;
  assignmentId?: string | null;
  poolItemId?: string | null;
  idempotencyKey: string;
  quantity?: number;
  operationType: InventoryOperationType;
  status?: InventoryOperationStatus;
  externalReference?: string | null;
  reason?: string | null;
  metadata?: string | null;
}

export interface NormalizedCreateInventoryOperationInput {
  blindBoxId: string | null;
  assignmentId: string | null;
  poolItemId: string | null;
  idempotencyKey: string;
  quantity: number;
  operationType: InventoryOperationType;
  status: InventoryOperationStatus;
  externalReference: string | null;
  reason: string | null;
  metadata: string | null;
}
