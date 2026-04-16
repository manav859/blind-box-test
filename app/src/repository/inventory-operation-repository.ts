import { randomUUID } from 'crypto';
import { BlindBoxDatabase, getBlindBoxDatabase } from '../db/client';
import { InventoryOperation, NormalizedCreateInventoryOperationInput } from '../domain/blind-box/types';
import { ConflictError, NotFoundError } from '../lib/errors';
import { isSqliteUniqueConstraintError, normalizeNullableString, nowIsoString } from './helpers';

interface InventoryOperationRow {
  id: string;
  shop: string;
  blind_box_id: string | null;
  assignment_id: string | null;
  pool_item_id: string | null;
  idempotency_key: string;
  quantity: number;
  operation_type: InventoryOperation['operationType'];
  status: InventoryOperation['status'];
  attempt_count: number;
  last_attempted_at: string | null;
  processing_started_at: string | null;
  completed_at: string | null;
  external_reference: string | null;
  reason: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

function mapInventoryOperationRow(row: InventoryOperationRow): InventoryOperation {
  return {
    id: row.id,
    shop: row.shop,
    blindBoxId: normalizeNullableString(row.blind_box_id),
    assignmentId: normalizeNullableString(row.assignment_id),
    poolItemId: normalizeNullableString(row.pool_item_id),
    idempotencyKey: row.idempotency_key,
    quantity: row.quantity,
    operationType: row.operation_type,
    status: row.status,
    attemptCount: row.attempt_count,
    lastAttemptedAt: normalizeNullableString(row.last_attempted_at),
    processingStartedAt: normalizeNullableString(row.processing_started_at),
    completedAt: normalizeNullableString(row.completed_at),
    externalReference: normalizeNullableString(row.external_reference),
    reason: normalizeNullableString(row.reason),
    metadata: normalizeNullableString(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface InventoryOperationRepository {
  create(shop: string, input: NormalizedCreateInventoryOperationInput): Promise<InventoryOperation>;
  listByShop(shop: string): Promise<InventoryOperation[]>;
  findById(shop: string, operationId: string): Promise<InventoryOperation | null>;
  findByAssignmentId(shop: string, assignmentId: string): Promise<InventoryOperation[]>;
  findByIdempotencyKey(shop: string, idempotencyKey: string): Promise<InventoryOperation | null>;
  updateStatus(
    shop: string,
    operationId: string,
    status: InventoryOperation['status'],
    updates?: {
      reason?: string | null;
      metadata?: string | null;
      externalReference?: string | null;
    },
  ): Promise<InventoryOperation>;
}

export class SqliteInventoryOperationRepository implements InventoryOperationRepository {
  constructor(private readonly db: BlindBoxDatabase) {}

  async create(shop: string, input: NormalizedCreateInventoryOperationInput): Promise<InventoryOperation> {
    const id = randomUUID();
    const timestamp = nowIsoString();

    try {
      await this.db.run(
        `
          INSERT INTO inventory_operations (
            id,
            shop,
            blind_box_id,
            assignment_id,
            pool_item_id,
            idempotency_key,
            quantity,
            operation_type,
            status,
            attempt_count,
            last_attempted_at,
            processing_started_at,
            completed_at,
            external_reference,
            reason,
            metadata,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          id,
          shop,
          input.blindBoxId,
          input.assignmentId,
          input.poolItemId,
          input.idempotencyKey,
          input.quantity,
          input.operationType,
          input.status,
          0,
          null,
          null,
          null,
          input.externalReference,
          input.reason,
          input.metadata,
          timestamp,
          timestamp,
        ],
      );
    } catch (error) {
      if (isSqliteUniqueConstraintError(error)) {
        throw new ConflictError('An inventory operation with the same assignment or idempotency key already exists');
      }

      throw error;
    }

    const operation = await this.findById(shop, id);
    if (!operation) {
      throw new NotFoundError('Failed to load the newly created inventory operation');
    }

    return operation;
  }

  async listByShop(shop: string): Promise<InventoryOperation[]> {
    const rows = await this.db.all<InventoryOperationRow>(
      `
        SELECT
          id,
          shop,
          blind_box_id,
          assignment_id,
          pool_item_id,
          idempotency_key,
          quantity,
          operation_type,
          status,
          attempt_count,
          last_attempted_at,
          processing_started_at,
          completed_at,
          external_reference,
          reason,
          metadata,
          created_at,
          updated_at
        FROM inventory_operations
        WHERE shop = ?
        ORDER BY created_at DESC
      `,
      [shop],
    );

    return rows.map(mapInventoryOperationRow);
  }

  async findById(shop: string, operationId: string): Promise<InventoryOperation | null> {
    const row = await this.db.get<InventoryOperationRow>(
      `
        SELECT
          id,
          shop,
          blind_box_id,
          assignment_id,
          pool_item_id,
          idempotency_key,
          quantity,
          operation_type,
          status,
          attempt_count,
          last_attempted_at,
          processing_started_at,
          completed_at,
          external_reference,
          reason,
          metadata,
          created_at,
          updated_at
        FROM inventory_operations
        WHERE shop = ? AND id = ?
      `,
      [shop, operationId],
    );

    return row ? mapInventoryOperationRow(row) : null;
  }

  async findByAssignmentId(shop: string, assignmentId: string): Promise<InventoryOperation[]> {
    const rows = await this.db.all<InventoryOperationRow>(
      `
        SELECT
          id,
          shop,
          blind_box_id,
          assignment_id,
          pool_item_id,
          idempotency_key,
          quantity,
          operation_type,
          status,
          attempt_count,
          last_attempted_at,
          processing_started_at,
          completed_at,
          external_reference,
          reason,
          metadata,
          created_at,
          updated_at
        FROM inventory_operations
        WHERE shop = ? AND assignment_id = ?
        ORDER BY created_at DESC
      `,
      [shop, assignmentId],
    );

    return rows.map(mapInventoryOperationRow);
  }

  async findByIdempotencyKey(shop: string, idempotencyKey: string): Promise<InventoryOperation | null> {
    const row = await this.db.get<InventoryOperationRow>(
      `
        SELECT
          id,
          shop,
          blind_box_id,
          assignment_id,
          pool_item_id,
          idempotency_key,
          quantity,
          operation_type,
          status,
          attempt_count,
          last_attempted_at,
          processing_started_at,
          completed_at,
          external_reference,
          reason,
          metadata,
          created_at,
          updated_at
        FROM inventory_operations
        WHERE shop = ? AND idempotency_key = ?
      `,
      [shop, idempotencyKey],
    );

    return row ? mapInventoryOperationRow(row) : null;
  }

  async updateStatus(
    shop: string,
    operationId: string,
    status: InventoryOperation['status'],
    updates: {
      reason?: string | null;
      metadata?: string | null;
      externalReference?: string | null;
      attemptCount?: number | null;
      lastAttemptedAt?: string | null;
      processingStartedAt?: string | null;
      completedAt?: string | null;
    } = {},
  ): Promise<InventoryOperation> {
    const timestamp = nowIsoString();

    await this.db.run(
      `
        UPDATE inventory_operations
        SET
          status = ?,
          reason = COALESCE(?, reason),
          metadata = COALESCE(?, metadata),
          external_reference = COALESCE(?, external_reference),
          attempt_count = COALESCE(?, attempt_count),
          last_attempted_at = COALESCE(?, last_attempted_at),
          processing_started_at = COALESCE(?, processing_started_at),
          completed_at = COALESCE(?, completed_at),
          updated_at = ?
        WHERE shop = ? AND id = ?
      `,
      [
        status,
        updates.reason ?? null,
        updates.metadata ?? null,
        updates.externalReference ?? null,
        updates.attemptCount ?? null,
        updates.lastAttemptedAt ?? null,
        updates.processingStartedAt ?? null,
        updates.completedAt ?? null,
        timestamp,
        shop,
        operationId,
      ],
    );

    const operation = await this.findById(shop, operationId);
    if (!operation) {
      throw new NotFoundError('Inventory operation not found after status update');
    }

    return operation;
  }
}

export async function getInventoryOperationRepository(): Promise<InventoryOperationRepository> {
  const db = await getBlindBoxDatabase();
  return new SqliteInventoryOperationRepository(db);
}
