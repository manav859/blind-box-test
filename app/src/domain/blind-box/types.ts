import {
  BlindBoxAssignmentStatus,
  BlindBoxSelectionStrategy,
  BlindBoxStatus,
  InventoryOperationStatus,
  InventoryOperationType,
  WebhookEventStatus,
} from './status';

export type RewardGroupSourceType = 'shopline_collection';

export interface BlindBox {
  id: string;
  shop: string;
  name: string;
  description: string | null;
  status: BlindBoxStatus;
  selectionStrategy: BlindBoxSelectionStrategy;
  shoplineProductId: string | null;
  shoplineVariantId: string | null;
  productTitleSnapshot: string | null;
  configJson: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBlindBoxInput {
  name: string;
  description?: string | null;
  status?: BlindBoxStatus;
  selectionStrategy?: BlindBoxSelectionStrategy;
  shoplineProductId?: string | null;
  shoplineVariantId?: string | null;
  productTitleSnapshot?: string | null;
  configJson?: string | null;
}

export interface NormalizedCreateBlindBoxInput {
  name: string;
  description: string | null;
  status: BlindBoxStatus;
  selectionStrategy: BlindBoxSelectionStrategy;
  shoplineProductId: string | null;
  shoplineVariantId: string | null;
  productTitleSnapshot: string | null;
  configJson: string | null;
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

export interface RewardGroup {
  id: string;
  shop: string;
  sourceType: RewardGroupSourceType;
  shoplineCollectionId: string;
  collectionTitleSnapshot: string | null;
  status: BlindBoxStatus;
  configJson: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertRewardGroupInput {
  id?: string;
  shoplineCollectionId: string;
  collectionTitleSnapshot?: string | null;
  status?: BlindBoxStatus;
  configJson?: string | null;
}

export interface NormalizedUpsertRewardGroupInput {
  id: string | null;
  sourceType: RewardGroupSourceType;
  shoplineCollectionId: string;
  collectionTitleSnapshot: string | null;
  status: BlindBoxStatus;
  configJson: string | null;
}

export interface BlindBoxRewardGroupLink {
  id: string;
  shop: string;
  blindBoxId: string;
  rewardGroupId: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertBlindBoxRewardGroupLinkInput {
  id?: string;
  blindBoxId: string;
  rewardGroupId: string;
}

export interface NormalizedUpsertBlindBoxRewardGroupLinkInput {
  id: string | null;
  blindBoxId: string;
  rewardGroupId: string;
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
}

export interface ExcludedRewardCandidate {
  productId: string | null;
  variantId: string | null;
  productTitle: string | null;
  variantTitle: string | null;
  reason: string;
  message: string;
}
