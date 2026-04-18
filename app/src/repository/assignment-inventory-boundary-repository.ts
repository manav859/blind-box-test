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
  reward_group_id: string | null;
  selected_pool_item_id: string | null;
  selected_reward_product_id: string | null;
  selected_reward_variant_id: string | null;
  selected_reward_title_snapshot: string | null;
  selected_reward_variant_title_snapshot: string | null;
  selected_reward_payload_json: string | null;
  status: BlindBoxAssignment['status'];
}

interface InventoryOperationBoundaryRow {
  id: string;
  status: InventoryOperation['status'];
  assignment_id: string | null;
  pool_item_id: string | null;
  reward_product_id: string | null;
  reward_variant_id: string | null;
}

export interface PersistAssignmentInventoryBoundaryInput {
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
        reward_group_id,
        selected_pool_item_id,
        selected_reward_product_id,
        selected_reward_variant_id,
        selected_reward_title_snapshot,
        selected_reward_variant_title_snapshot,
        selected_reward_payload_json,
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
        pool_item_id,
        reward_product_id,
        reward_variant_id
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
      poolItemId?: string | null;
      rewardGroupId?: string | null;
      rewardProductId?: string | null;
      rewardVariantId?: string | null;
      rewardTitleSnapshot?: string | null;
      rewardVariantTitleSnapshot?: string | null;
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
        reward_group_id,
        reward_product_id,
        reward_variant_id,
        reward_title_snapshot,
        reward_variant_title_snapshot,
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      operationId,
      shop,
      input.blindBoxId,
      input.assignmentId,
      input.poolItemId || null,
      input.rewardGroupId || null,
      input.rewardProductId || null,
      input.rewardVariantId || null,
      input.rewardTitleSnapshot || null,
      input.rewardVariantTitleSnapshot || null,
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
    if (!input.selectedPoolItemId && !input.selectedRewardProductId) {
      throw new ValidationError('Assignment boundary requires either a selected pool item or a selected reward product');
    }

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
          reward_group_id,
          selected_pool_item_id,
          selected_reward_product_id,
          selected_reward_variant_id,
          selected_reward_title_snapshot,
          selected_reward_variant_title_snapshot,
          selected_reward_payload_json,
          status,
          selection_strategy,
          idempotency_key,
          metadata,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        assignmentId,
        shop,
        input.blindBoxId,
        input.orderId,
        input.orderLineId,
        input.rewardGroupId || null,
        input.selectedPoolItemId || null,
        input.selectedRewardProductId || null,
        input.selectedRewardVariantId || null,
        input.selectedRewardTitleSnapshot || null,
        input.selectedRewardVariantTitleSnapshot || null,
        input.selectedRewardPayloadJson || null,
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
      poolItemId: input.selectedPoolItemId || null,
      rewardGroupId: input.rewardGroupId || null,
      rewardProductId: input.selectedRewardProductId || null,
      rewardVariantId: input.selectedRewardVariantId || null,
      rewardTitleSnapshot: input.selectedRewardTitleSnapshot || null,
      rewardVariantTitleSnapshot: input.selectedRewardVariantTitleSnapshot || null,
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

    if (!existingAssignment.selected_pool_item_id && !existingAssignment.selected_reward_product_id) {
      throw new ValidationError(
        'Existing blind-box assignment is missing both its selected pool item and selected reward product',
      );
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
      rewardGroupId: existingAssignment.reward_group_id,
      rewardProductId: existingAssignment.selected_reward_product_id,
      rewardVariantId: existingAssignment.selected_reward_variant_id,
      rewardTitleSnapshot: existingAssignment.selected_reward_title_snapshot,
      rewardVariantTitleSnapshot: existingAssignment.selected_reward_variant_title_snapshot,
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
