import { ValidationError } from '../../lib/errors';
import {
  BLIND_BOX_ASSIGNMENT_STATUSES,
  BLIND_BOX_SELECTION_STRATEGIES,
  BLIND_BOX_STATUSES,
  INVENTORY_OPERATION_STATUSES,
  INVENTORY_OPERATION_TYPES,
} from './status';
import {
  CreateBlindBoxAssignmentInput,
  CreateBlindBoxInput,
  CreateInventoryOperationInput,
  NormalizedCreateBlindBoxAssignmentInput,
  NormalizedCreateBlindBoxInput,
  NormalizedCreateInventoryOperationInput,
  NormalizedUpsertBlindBoxPoolItemInput,
  NormalizedUpsertBlindBoxProductMappingInput,
  UpsertBlindBoxPoolItemInput,
  UpsertBlindBoxProductMappingInput,
} from './types';

export function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(`${fieldName} must be a non-empty string`);
  }

  return value.trim();
}

export function normalizeOptionalString(value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw new ValidationError('Expected a string value');
  }

  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : null;
}

export function requirePositiveInteger(value: unknown, fieldName: string): number {
  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new ValidationError(`${fieldName} must be a positive integer`);
  }

  return parsedValue;
}

export function requireNonNegativeInteger(value: unknown, fieldName: string): number {
  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue < 0) {
    throw new ValidationError(`${fieldName} must be a non-negative integer`);
  }

  return parsedValue;
}

export function normalizeBoolean(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 'true' || value === '1' || value === 1) {
    return true;
  }

  if (value === 'false' || value === '0' || value === 0) {
    return false;
  }

  throw new ValidationError('Expected a boolean-like value');
}

function requireIncludedValue<T extends readonly string[]>(
  value: unknown,
  fieldName: string,
  allowedValues: T,
  fallback?: T[number],
): T[number] {
  if ((value === undefined || value === null || value === '') && fallback) {
    return fallback;
  }

  const parsedValue = requireNonEmptyString(value, fieldName);
  if (!allowedValues.includes(parsedValue as T[number])) {
    throw new ValidationError(`${fieldName} must be one of: ${allowedValues.join(', ')}`);
  }

  return parsedValue as T[number];
}

export function validateCreateBlindBoxInput(input: CreateBlindBoxInput): NormalizedCreateBlindBoxInput {
  return {
    name: requireNonEmptyString(input.name, 'name'),
    description: normalizeOptionalString(input.description),
    status: requireIncludedValue(input.status, 'status', BLIND_BOX_STATUSES, 'draft'),
    selectionStrategy: requireIncludedValue(
      input.selectionStrategy,
      'selectionStrategy',
      BLIND_BOX_SELECTION_STRATEGIES,
      'uniform',
    ),
  };
}

export function validateUpsertBlindBoxPoolItemInput(
  input: UpsertBlindBoxPoolItemInput,
): NormalizedUpsertBlindBoxPoolItemInput {
  return {
    id: normalizeOptionalString(input.id),
    blindBoxId: requireNonEmptyString(input.blindBoxId, 'blindBoxId'),
    label: requireNonEmptyString(input.label, 'label'),
    sourceProductId: normalizeOptionalString(input.sourceProductId),
    sourceVariantId: normalizeOptionalString(input.sourceVariantId),
    enabled: normalizeBoolean(input.enabled, true),
    weight: requirePositiveInteger(input.weight ?? 1, 'weight'),
    inventoryQuantity: requireNonNegativeInteger(input.inventoryQuantity ?? 0, 'inventoryQuantity'),
    metadata: normalizeOptionalString(input.metadata),
  };
}

export function validateUpsertBlindBoxProductMappingInput(
  input: UpsertBlindBoxProductMappingInput,
): NormalizedUpsertBlindBoxProductMappingInput {
  return {
    id: normalizeOptionalString(input.id),
    blindBoxId: requireNonEmptyString(input.blindBoxId, 'blindBoxId'),
    productId: requireNonEmptyString(input.productId, 'productId'),
    productVariantId: normalizeOptionalString(input.productVariantId),
    enabled: normalizeBoolean(input.enabled, true),
  };
}

export function validateCreateBlindBoxAssignmentInput(
  input: CreateBlindBoxAssignmentInput,
): NormalizedCreateBlindBoxAssignmentInput {
  return {
    blindBoxId: requireNonEmptyString(input.blindBoxId, 'blindBoxId'),
    orderId: requireNonEmptyString(input.orderId, 'orderId'),
    orderLineId: requireNonEmptyString(input.orderLineId, 'orderLineId'),
    selectedPoolItemId: normalizeOptionalString(input.selectedPoolItemId),
    status: requireIncludedValue(input.status, 'status', BLIND_BOX_ASSIGNMENT_STATUSES),
    selectionStrategy:
      input.selectionStrategy === undefined || input.selectionStrategy === null
        ? null
        : requireIncludedValue(
            input.selectionStrategy,
            'selectionStrategy',
            BLIND_BOX_SELECTION_STRATEGIES,
          ),
    idempotencyKey: requireNonEmptyString(input.idempotencyKey, 'idempotencyKey'),
    metadata: normalizeOptionalString(input.metadata),
  };
}

export function validateCreateInventoryOperationInput(
  input: CreateInventoryOperationInput,
): NormalizedCreateInventoryOperationInput {
  return {
    blindBoxId: normalizeOptionalString(input.blindBoxId),
    assignmentId: normalizeOptionalString(input.assignmentId),
    poolItemId: normalizeOptionalString(input.poolItemId),
    operationType: requireIncludedValue(input.operationType, 'operationType', INVENTORY_OPERATION_TYPES),
    status: requireIncludedValue(input.status, 'status', INVENTORY_OPERATION_STATUSES, 'pending'),
    externalReference: normalizeOptionalString(input.externalReference),
    reason: normalizeOptionalString(input.reason),
    metadata: normalizeOptionalString(input.metadata),
  };
}

export function toSqliteBoolean(value: boolean): number {
  return value ? 1 : 0;
}

export function fromSqliteBoolean(value: unknown): boolean {
  return Number(value) === 1;
}
