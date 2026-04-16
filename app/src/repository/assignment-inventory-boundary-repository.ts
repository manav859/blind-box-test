import { randomUUID } from 'crypto';
import { BlindBoxDatabase, getBlindBoxDatabase } from '../db/client';
import { BlindBoxAssignment, InventoryOperation } from '../domain/blind-box/types';
import {
  isRecoverableMissingInventoryBoundaryAssignmentStatus,
} from '../domain/blind-box/inventory-state-machine';
import { ConflictError, ValidationError } from '../lib/errors';
import { isSqliteUniqueConstraintError, nowIsoString } from './helpers';

interface AssignmentBoundaryRow {
  id: string;
  blind_box_id: string;
  order_id: string;
  order_line_id: string;
  selected_pool_item_id: string | null;
  status: BlindBoxAssignment['status'];
}

interface InventoryOperationBoundaryRow {
  id: string;
  status: InventoryOperation['status'];
  assignment_id: string | null;
  pool_item_id: string | null;
}

export interface PersistAssignmentInventoryBoundaryInput {
  blindBoxId: string;
  orderId: string;
  orderLineId: string;
  selectedPoolItemId: string;
  selectionStrategy: NonNullable<BlindBoxAssignment['selectionStrategy']>;
  idempotencyKey: string;
  assignmentMetadata: string | null;
  inventoryOperationMetadata: string | null;
}

export interface PersistAssignmentInventoryBoundaryResult {
  assignmentId: string;
  inventoryOperationId: string;
  wasExistingAssignment: boolean;
  wasExistingInventoryOperation: boolean;
  recoveredMissingInventoryOperation: boolean;
}

async function loadAssignmentBoundaryRow(
  db: BlindBoxDatabase,
  shop: string,
  orderId: string,
  orderLineId: string,
): Promise<AssignmentBoundaryRow | undefined> {
  return db.get<AssignmentBoundaryRow>(
    `
      SELECT
        id,
        blind_box_id,
        order_id,
        order_line_id,
        selected_pool_item_id,
        status
      FROM blind_box_assignments
      WHERE shop = ? AND order_id = ? AND order_line_id = ?
    `,
    [shop, orderId, orderLineId],
  );
}

async function loadCommitOperationBoundaryRow(
  db: BlindBoxDatabase,
  shop: string,
  assignmentId: string,
): Promise<InventoryOperationBoundaryRow | undefined> {
  return db.get<InventoryOperationBoundaryRow>(
    `
      SELECT
        id,
        status,
        assignment_id,
        pool_item_id
      FROM inventory_operations
      WHERE shop = ? AND assignment_id = ? AND operation_type = 'commit'
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [shop, assignmentId],
  );
}

async function insertPendingCommitOperation(
  db: BlindBoxDatabase,
  shop: string,
  input: {
    blindBoxId: string;
    assignmentId: string;
    poolItemId: string;
    idempotencyKey: string;
    metadata: string | null;
    reason: string;
  },
): Promise<string> {
  const operationId = randomUUID();
  const timestamp = nowIsoString();

  await db.run(
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
      operationId,
      shop,
      input.blindBoxId,
      input.assignmentId,
      input.poolItemId,
      input.idempotencyKey,
      1,
      'commit',
      'pending',
      0,
      null,
      null,
      null,
      input.idempotencyKey,
      input.reason,
      input.metadata,
      timestamp,
      timestamp,
    ],
  );

  return operationId;
}

export interface AssignmentInventoryBoundaryRepository {
  persistAssignmentInventoryBoundary(
    shop: string,
    input: PersistAssignmentInventoryBoundaryInput,
  ): Promise<PersistAssignmentInventoryBoundaryResult>;
}

export class SqliteAssignmentInventoryBoundaryRepository
  implements AssignmentInventoryBoundaryRepository
{
  constructor(private readonly db: BlindBoxDatabase) {}

  async persistAssignmentInventoryBoundary(
    shop: string,
    input: PersistAssignmentInventoryBoundaryInput,
  ): Promise<PersistAssignmentInventoryBoundaryResult> {
    try {
      return await this.db.transaction((transaction) =>
        this.persistBoundaryInTransaction(transaction, shop, input),
      );
    } catch (error) {
      if (!isSqliteUniqueConstraintError(error)) {
        throw error;
      }

      return this.resolveExistingBoundaryAfterConflict(shop, input);
    }
  }

  private async persistBoundaryInTransaction(
    transaction: BlindBoxDatabase,
    shop: string,
    input: PersistAssignmentInventoryBoundaryInput,
  ): Promise<PersistAssignmentInventoryBoundaryResult> {
    const existingAssignment = await loadAssignmentBoundaryRow(
      transaction,
      shop,
      input.orderId,
      input.orderLineId,
    );
    if (existingAssignment) {
      return this.ensureOperationForExistingAssignment(transaction, shop, input, existingAssignment);
    }

    const assignmentId = randomUUID();
    const timestamp = nowIsoString();

    await transaction.run(
      `
        INSERT INTO blind_box_assignments (
          id,
          shop,
          blind_box_id,
          order_id,
          order_line_id,
          selected_pool_item_id,
          status,
          selection_strategy,
          idempotency_key,
          metadata,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        assignmentId,
        shop,
        input.blindBoxId,
        input.orderId,
        input.orderLineId,
        input.selectedPoolItemId,
        'inventory_pending',
        input.selectionStrategy,
        input.idempotencyKey,
        input.assignmentMetadata,
        timestamp,
        timestamp,
      ],
    );

    const inventoryOperationId = await insertPendingCommitOperation(transaction, shop, {
      blindBoxId: input.blindBoxId,
      assignmentId,
      poolItemId: input.selectedPoolItemId,
      idempotencyKey: input.idempotencyKey,
      metadata: input.inventoryOperationMetadata,
      reason: 'Inventory execution pending after immutable blind-box assignment persistence',
    });

    return {
      assignmentId,
      inventoryOperationId,
      wasExistingAssignment: false,
      wasExistingInventoryOperation: false,
      recoveredMissingInventoryOperation: false,
    };
  }

  private async ensureOperationForExistingAssignment(
    transaction: BlindBoxDatabase,
    shop: string,
    input: PersistAssignmentInventoryBoundaryInput,
    existingAssignment: AssignmentBoundaryRow,
  ): Promise<PersistAssignmentInventoryBoundaryResult> {
    const existingOperation = await loadCommitOperationBoundaryRow(transaction, shop, existingAssignment.id);
    if (existingOperation) {
      return {
        assignmentId: existingAssignment.id,
        inventoryOperationId: existingOperation.id,
        wasExistingAssignment: true,
        wasExistingInventoryOperation: true,
        recoveredMissingInventoryOperation: false,
      };
    }

    if (!existingAssignment.selected_pool_item_id) {
      throw new ValidationError('Existing blind-box assignment is missing its selected pool item');
    }

    if (!isRecoverableMissingInventoryBoundaryAssignmentStatus(existingAssignment.status)) {
      throw new ConflictError(
        `Existing assignment is missing its inventory operation and requires reconciliation from status "${existingAssignment.status}"`,
      );
    }

    const timestamp = nowIsoString();

    await transaction.run(
      `
        UPDATE blind_box_assignments
        SET
          status = ?,
          updated_at = ?
        WHERE shop = ? AND id = ?
      `,
      ['inventory_pending', timestamp, shop, existingAssignment.id],
    );

    const inventoryOperationId = await insertPendingCommitOperation(transaction, shop, {
      blindBoxId: existingAssignment.blind_box_id,
      assignmentId: existingAssignment.id,
      poolItemId: existingAssignment.selected_pool_item_id,
      idempotencyKey: input.idempotencyKey,
      metadata: input.inventoryOperationMetadata,
      reason: 'Recovered missing inventory operation for an existing immutable blind-box assignment',
    });

    return {
      assignmentId: existingAssignment.id,
      inventoryOperationId,
      wasExistingAssignment: true,
      wasExistingInventoryOperation: false,
      recoveredMissingInventoryOperation: true,
    };
  }

  private async resolveExistingBoundaryAfterConflict(
    shop: string,
    input: PersistAssignmentInventoryBoundaryInput,
  ): Promise<PersistAssignmentInventoryBoundaryResult> {
    const existingAssignment = await loadAssignmentBoundaryRow(this.db, shop, input.orderId, input.orderLineId);
    if (!existingAssignment) {
      throw new ConflictError('Assignment boundary already exists but could not be resolved safely');
    }

    const existingOperation = await loadCommitOperationBoundaryRow(this.db, shop, existingAssignment.id);
    if (existingOperation) {
      return {
        assignmentId: existingAssignment.id,
        inventoryOperationId: existingOperation.id,
        wasExistingAssignment: true,
        wasExistingInventoryOperation: true,
        recoveredMissingInventoryOperation: false,
      };
    }

    return this.db.transaction((transaction) =>
      this.ensureOperationForExistingAssignment(transaction, shop, input, existingAssignment),
    );
  }
}

export async function getAssignmentInventoryBoundaryRepository(): Promise<AssignmentInventoryBoundaryRepository> {
  const db = await getBlindBoxDatabase();
  return new SqliteAssignmentInventoryBoundaryRepository(db);
}
