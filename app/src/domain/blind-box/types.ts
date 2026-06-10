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
  /** The SHOPLINE product the customer buys to trigger this blind box. */
  triggerProductId: string | null;
  triggerProductTitleSnapshot: string | null;
  configJson: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBlindBoxInput {
  name: string;
  description?: string | null;
  status?: BlindBoxStatus;
  triggerProductId?: string | null;
  triggerProductTitleSnapshot?: string | null;
  configJson?: string | null;
}

export interface NormalizedCreateBlindBoxInput {
  name: string;
  description: string | null;
  status: BlindBoxStatus;
  triggerProductId: string | null;
  triggerProductTitleSnapshot: string | null;
  configJson: string | null;
}

/**
 * A reward product in a blind box's pool. Selection is inventory-weighted at
 * resolution time (no stored weight): P(item) = live_stock / Σ live_stock.
 */
export interface BlindBoxPoolItem {
  id: string;
  shop: string;
  blindBoxId: string;
  rewardProductId: string;
  rewardVariantId: string | null;
  rewardTitleSnapshot: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertBlindBoxPoolItemInput {
  id?: string;
  blindBoxId: string;
  rewardProductId: string;
  rewardVariantId?: string | null;
  rewardTitleSnapshot?: string | null;
}

export interface NormalizedUpsertBlindBoxPoolItemInput {
  id: string | null;
  blindBoxId: string;
  rewardProductId: string;
  rewardVariantId: string | null;
  rewardTitleSnapshot: string | null;
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
  rewardGroupId: string | null;
  selectedPoolItemId: string | null;
  selectedRewardProductId: string | null;
  selectedRewardVariantId: string | null;
  selectedRewardTitleSnapshot: string | null;
  selectedRewardVariantTitleSnapshot: string | null;
  selectedRewardPayloadJson: string | null;
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
  rewardGroupId?: string | null;
  selectedPoolItemId?: string | null;
  selectedRewardProductId?: string | null;
  selectedRewardVariantId?: string | null;
  selectedRewardTitleSnapshot?: string | null;
  selectedRewardVariantTitleSnapshot?: string | null;
  selectedRewardPayloadJson?: string | null;
  status: BlindBoxAssignmentStatus;
  selectionStrategy?: BlindBoxSelectionStrategy | null;
  idempotencyKey: string;
  metadata?: string | null;
}

export interface NormalizedCreateBlindBoxAssignmentInput {
  blindBoxId: string;
  orderId: string;
  orderLineId: string;
  rewardGroupId: string | null;
  selectedPoolItemId: string | null;
  selectedRewardProductId: string | null;
  selectedRewardVariantId: string | null;
  selectedRewardTitleSnapshot: string | null;
  selectedRewardVariantTitleSnapshot: string | null;
  selectedRewardPayloadJson: string | null;
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
  rewardGroupId: string | null;
  rewardProductId: string | null;
  rewardVariantId: string | null;
  rewardTitleSnapshot: string | null;
  rewardVariantTitleSnapshot: string | null;
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
  rewardGroupId?: string | null;
  rewardProductId?: string | null;
  rewardVariantId?: string | null;
  rewardTitleSnapshot?: string | null;
  rewardVariantTitleSnapshot?: string | null;
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
  rewardGroupId: string | null;
  rewardProductId: string | null;
  rewardVariantId: string | null;
  rewardTitleSnapshot: string | null;
  rewardVariantTitleSnapshot: string | null;
  idempotencyKey: string;
  quantity: number;
  operationType: InventoryOperationType;
  status: InventoryOperationStatus;
  externalReference: string | null;
  reason: string | null;
  metadata: string | null;
}

export interface RewardCandidate {
  productId: string;
  variantId: string | null;
  productTitle: string | null;
  variantTitle: string | null;
  inventoryQuantity: number | null;
  selectionWeight: number;
  payloadJson: string | null;
  /** How many variants on this product were eligible; >1 means multi-variant selection was used. */
  eligibleVariantCount: number;
}

export interface ExcludedRewardCandidate {
  productId: string | null;
  variantId: string | null;
  productTitle: string | null;
  variantTitle: string | null;
  reason: string;
  message: string;
  // Diagnostic fields — populated when available
  productStatus: string | null;
  inventoryQuantity: number | null;
  variantCount: number | null;
}
