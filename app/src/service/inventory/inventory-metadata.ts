import {
  getInventoryGatewayBoundaryDescription,
  InventoryGatewayBoundaryDescription,
} from '../../integration/shopline/inventory-gateway';
import { INVENTORY_WORKFLOW_STATE_MACHINE } from '../../domain/blind-box/inventory-state-machine';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export interface BuildInitialOperationMetadataInput {
  orderId: string;
  orderLineId: string;
  assignmentId: string;
  blindBoxId: string;
  poolItemId: string;
  createdBy: string;
  metadata?: string | null;
  gatewayBoundary?: InventoryGatewayBoundaryDescription;
}

export function parseMetadataRecord(value: string | null | undefined): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsedValue = JSON.parse(value);
    if (isRecord(parsedValue)) {
      return parsedValue;
    }

    return {
      rawValue: parsedValue,
    };
  } catch {
    return {
      rawValue: value,
    };
  }
}

export function withAttemptEntry(
  metadata: string | null | undefined,
  entry: Record<string, unknown>,
  patch: Record<string, unknown> = {},
): string {
  const metadataRecord = parseMetadataRecord(metadata);
  const attempts = Array.isArray(metadataRecord.attempts) ? [...metadataRecord.attempts] : [];

  return JSON.stringify({
    ...metadataRecord,
    ...patch,
    attempts: [...attempts, entry],
  });
}

export function withInventorySummary(
  metadata: string | null | undefined,
  patch: Record<string, unknown>,
): string {
  const metadataRecord = parseMetadataRecord(metadata);
  const existingInventory = parseMetadataRecord(
    typeof metadataRecord.inventory === 'string' ? metadataRecord.inventory : undefined,
  );
  const nextInventory =
    isRecord(metadataRecord.inventory)
      ? { ...(metadataRecord.inventory as Record<string, unknown>), ...patch }
      : { ...existingInventory, ...patch };

  return JSON.stringify({
    ...metadataRecord,
    inventory: nextInventory,
  });
}

export function buildInitialOperationMetadata(
  input: BuildInitialOperationMetadataInput,
): string {
  return JSON.stringify({
    orderId: input.orderId,
    orderLineId: input.orderLineId,
    assignmentId: input.assignmentId,
    blindBoxId: input.blindBoxId,
    poolItemId: input.poolItemId,
    stateMachine: INVENTORY_WORKFLOW_STATE_MACHINE,
    createdBy: input.createdBy,
    gatewayBoundary: input.gatewayBoundary || getInventoryGatewayBoundaryDescription(),
    assignmentBoundary: {
      assignmentPersistedBeforeExecution: true,
      inventoryExecutionStarted: false,
    },
    ...(input.metadata ? parseMetadataRecord(input.metadata) : {}),
  });
}
