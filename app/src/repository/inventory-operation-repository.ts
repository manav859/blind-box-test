import { randomUUID } from 'crypto';
import { BlindBoxDatabase, getBlindBoxDatabase } from '../db/client';
import { InventoryOperation, NormalizedCreateInventoryOperationInput } from '../domain/blind-box/types';
import { NotFoundError } from '../lib/errors';
import { normalizeNullableString, nowIsoString } from './helpers';

interface InventoryOperationRow {
  id: string;
  shop: string;
  blind_box_id: string | null;
  assignment_id: string | null;
  pool_item_id: string | null;
  operation_type: InventoryOperation['operationType'];
  status: InventoryOperation['status'];
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
    operationType: row.operation_type,
    status: row.status,
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
  findByAssignmentId(shop: string, assignmentId: string): Promise<InventoryOperation[]>;
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

    await this.db.run(
      `
        INSERT INTO inventory_operations (
          id,
          shop,
          blind_box_id,
          assignment_id,
          pool_item_id,
          operation_type,
          status,
          external_reference,
          reason,
          metadata,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        shop,
        input.blindBoxId,
        input.assignmentId,
        input.poolItemId,
        input.operationType,
        input.status,
        input.externalReference,
        input.reason,
        input.metadata,
        timestamp,
        timestamp,
      ],
    );

    const operation = await this.db.get<InventoryOperationRow>(
      `
        SELECT
          id,
          shop,
          blind_box_id,
          assignment_id,
          pool_item_id,
          operation_type,
          status,
          external_reference,
          reason,
          metadata,
          created_at,
          updated_at
        FROM inventory_operations
        WHERE shop = ? AND id = ?
      `,
      [shop, id],
    );

    if (!operation) {
      throw new NotFoundError('Failed to load the newly created inventory operation');
    }

    return mapInventoryOperationRow(operation);
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
          operation_type,
          status,
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

  async findByAssignmentId(shop: string, assignmentId: string): Promise<InventoryOperation[]> {
    const rows = await this.db.all<InventoryOperationRow>(
      `
        SELECT
          id,
          shop,
          blind_box_id,
          assignment_id,
          pool_item_id,
          operation_type,
          status,
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

  async updateStatus(
    shop: string,
    operationId: string,
    status: InventoryOperation['status'],
    updates: {
      reason?: string | null;
      metadata?: string | null;
      externalReference?: string | null;
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
          updated_at = ?
        WHERE shop = ? AND id = ?
      `,
      [status, updates.reason ?? null, updates.metadata ?? null, updates.externalReference ?? null, timestamp, shop, operationId],
    );

    const row = await this.db.get<InventoryOperationRow>(
      `
        SELECT
          id,
          shop,
          blind_box_id,
          assignment_id,
          pool_item_id,
          operation_type,
          status,
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

    if (!row) {
      throw new NotFoundError('Inventory operation not found after status update');
    }

    return mapInventoryOperationRow(row);
  }
}

export async function getInventoryOperationRepository(): Promise<InventoryOperationRepository> {
  const db = await getBlindBoxDatabase();
  return new SqliteInventoryOperationRepository(db);
}
