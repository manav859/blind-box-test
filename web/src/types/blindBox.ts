export const BLIND_BOX_STATUSES = ["draft", "active", "archived"] as const;
export const BLIND_BOX_SELECTION_STRATEGIES = ["uniform", "weighted"] as const;
export const BLIND_BOX_ASSIGNMENT_STATUSES = [
  "pending",
  "assigned",
  "inventory_pending",
  "inventory_processing",
  "inventory_committed",
  "inventory_failed",
] as const;
export const WEBHOOK_EVENT_STATUSES = [
  "received",
  "processing",
  "processed",
  "ignored",
  "failed",
] as const;
export const INVENTORY_OPERATION_STATUSES = [
  "pending",
  "processing",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export const INVENTORY_OPERATION_TYPES = [
  "reserve",
  "commit",
  "release",
  "adjustment",
] as const;

export type BlindBoxStatus = (typeof BLIND_BOX_STATUSES)[number];
export type BlindBoxSelectionStrategy =
  (typeof BLIND_BOX_SELECTION_STRATEGIES)[number];
export type BlindBoxAssignmentStatus =
  (typeof BLIND_BOX_ASSIGNMENT_STATUSES)[number];
export type WebhookEventStatus = (typeof WEBHOOK_EVENT_STATUSES)[number];
export type InventoryOperationStatus =
  (typeof INVENTORY_OPERATION_STATUSES)[number];
export type InventoryOperationType =
  (typeof INVENTORY_OPERATION_TYPES)[number];
export type InventoryLocationResolution =
  | "configured"
  | "default"
  | "single_active";

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

export interface BlindBoxCatalog {
  blindBoxes: BlindBox[];
  poolItems: BlindBoxPoolItem[];
  poolItemsById: Record<string, BlindBoxPoolItem>;
}

export interface FailureLogEntry {
  id: string;
  source: "assignment" | "inventory";
  blindBoxId: string | null;
  blindBoxName: string;
  assignmentId: string | null;
  orderId: string;
  poolItemId: string | null;
  poolItemLabel: string;
  status: string;
  reason: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryDebugLocation {
  id: string;
  name: string | null;
  active: boolean;
  isDefault: boolean;
}

export interface InventoryDebugProductVariant {
  variantId: string | null;
  title: string | null;
  sku: string | null;
  inventoryItemId: string | null;
  inventoryQuantity: number | null;
  tracked: boolean | null;
}

export interface InventoryDebugProduct {
  productId: string;
  normalizedProductId: string;
  title: string | null;
  variants: InventoryDebugProductVariant[];
  traceIds: string[];
}

export interface InventoryDebugIssue {
  code: string;
  message: string;
}

export interface InventoryDebugInventoryLevel {
  inventoryItemId: string;
  locationId: string;
  variantId: string | null;
  available: number | null;
  updatedAt: string | null;
  isConfiguredLocation: boolean;
}

export interface InventoryDebugVariantInventory {
  variantId: string;
  normalizedVariantId: string;
  productId: string | null;
  inventoryItemId: string | null;
  tracked: boolean | null;
  requiredShipping: boolean | null;
  sku: string | null;
  configuredLocationId: string | null;
  executionLocationId: string | null;
  executionLocationResolution: "configured" | "default" | "single_active" | null;
  linkedLocationIds: string[];
  inventoryLevels: InventoryDebugInventoryLevel[];
  issues: InventoryDebugIssue[];
  traceIds: string[];
}

export interface InventoryExecutionIdentifiers {
  assignmentSourceProductId: string | null;
  assignmentSourceVariantId: string | null;
  normalizedSourceProductId: string | null;
  normalizedSourceVariantId: string | null;
  resolvedVariantId: string | null;
  inventoryItemId: string;
  locationId: string;
  locationResolution: InventoryLocationResolution;
}

export interface InventoryItemState {
  id: string;
  variantId: string | null;
  tracked: boolean;
  requiredShipping: boolean | null;
  sku: string | null;
}

export interface InventoryLevelState {
  inventoryItemId: string;
  locationId: string;
  variantId: string | null;
  available: number | null;
  updatedAt: string | null;
}

export interface InventoryExecutionReadinessIssue {
  code: string;
  message: string;
  fixRecommendation: string;
}

export interface InventoryExecutionReadinessReport {
  status: "ready" | "not_ready";
  runtimeExecutionMode: "deferred" | "execute";
  configuredScopes: string[];
  requiredScopes: string[];
  missingScopes: string[];
  configuredLocationId: string | null;
  poolItemId: string;
  poolItemLabel: string;
  identifiers: InventoryExecutionIdentifiers | null;
  inventoryItem: InventoryItemState | null;
  inventoryLevel: InventoryLevelState | null;
  issues: InventoryExecutionReadinessIssue[];
  summary: string;
}

export interface InventoryAdjustmentResult {
  inventoryItemId: string;
  locationId: string;
  variantId: string | null;
  adjustedDelta: number;
  traceId: string | null;
  rawResponse: unknown;
}

export interface InventoryExecutionResult {
  operation: InventoryOperation;
  assignment: BlindBoxAssignment;
  poolItem: BlindBoxPoolItem;
  outcome: "succeeded" | "failed" | "processing" | "noop";
  gatewayResult?: InventoryAdjustmentResult | null;
  message?: string;
}
