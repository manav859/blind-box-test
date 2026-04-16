import { BlindBoxDatabase, getBlindBoxDatabase } from '../db/client';
import { InventoryOperation } from '../domain/blind-box/types';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors';
import { nowIsoString } from './helpers';

interface InventoryExecutionRow {
  operation_id: string;
  operation_status: InventoryOperation['status'];
  quantity: number;
  assignment_id: string | null;
  assignment_exists: string | null;
  pool_item_id: string | null;
  pool_item_exists: string | null;
}

async function loadExecutionRow(
  db: BlindBoxDatabase,
  shop: string,
  operationId: string,
): Promise<InventoryExecutionRow | undefined> {
  return db.get<InventoryExecutionRow>(
    `
      SELECT
        io.id AS operation_id,
        io.status AS operation_status,
        io.quantity AS quantity,
        io.assignment_id AS assignment_id,
        a.id AS assignment_exists,
        io.pool_item_id AS pool_item_id,
        p.id AS pool_item_exists
      FROM inventory_operations io
      LEFT JOIN blind_box_assignments a
        ON a.id = io.assignment_id AND a.shop = io.shop
      LEFT JOIN blind_box_pool_items p
        ON p.id = io.pool_item_id AND p.shop = io.shop
      WHERE io.shop = ? AND io.id = ?
    `,
    [shop, operationId],
  );
}

export interface InventoryExecutionRepository {
  startExecution(
    shop: string,
    operationId: string,
    operationMetadata: string,
    assignmentMetadata: string,
  ): Promise<void>;
  markSucceeded(
    shop: string,
    operationId: string,
    operationMetadata: string,
    assignmentMetadata: string,
  ): Promise<void>;
  markFailed(
    shop: string,
    operationId: string,
    reason: string,
    operationMetadata: string,
    assignmentMetadata: string,
    options?: {
      releaseReservedQuantity?: boolean;
      incrementAttemptCount?: boolean;
    },
  ): Promise<void>;
  markIndeterminate(
    shop: string,
    operationId: string,
    reason: string,
    operationMetadata: string,
    assignmentMetadata: string,
  ): Promise<void>;
}

export class SqliteInventoryExecutionRepository implements InventoryExecutionRepository {
  constructor(private readonly db: BlindBoxDatabase) {}

  async startExecution(
    shop: string,
    operationId: string,
    operationMetadata: string,
    assignmentMetadata: string,
  ): Promise<void> {
    await this.db.transaction(async (transaction) => {
      const executionRow = await loadExecutionRow(transaction, shop, operationId);
      if (!executionRow) {
        throw new NotFoundError('Inventory operation not found for execution');
      }

      if (!executionRow.assignment_id || !executionRow.assignment_exists) {
        throw new ValidationError('Inventory operation is missing its blind-box assignment context');
      }

      if (!executionRow.pool_item_id || !executionRow.pool_item_exists) {
        throw new ValidationError('Inventory operation is missing its pool item context');
      }

      if (!['pending', 'failed'].includes(executionRow.operation_status)) {
        throw new ConflictError(`Inventory operation cannot start from status "${executionRow.operation_status}"`);
      }

      const timestamp = nowIsoString();
      const reservationResult = await transaction.run(
        `
          UPDATE blind_box_pool_items
          SET
            inventory_quantity = inventory_quantity - ?,
            updated_at = ?
          WHERE shop = ? AND id = ? AND inventory_quantity >= ?
        `,
        [executionRow.quantity, timestamp, shop, executionRow.pool_item_id, executionRow.quantity],
      );

      if (reservationResult.changes !== 1) {
        throw new ConflictError('Pool item inventory could not be reserved safely for execution');
      }

      await transaction.run(
        `
          UPDATE blind_box_assignments
          SET
            status = ?,
            metadata = ?,
            updated_at = ?
          WHERE shop = ? AND id = ?
        `,
        ['inventory_processing', assignmentMetadata, timestamp, shop, executionRow.assignment_id],
      );

      await transaction.run(
        `
          UPDATE inventory_operations
          SET
            status = ?,
            metadata = ?,
            reason = NULL,
            attempt_count = attempt_count + 1,
            last_attempted_at = ?,
            processing_started_at = ?,
            completed_at = NULL,
            updated_at = ?
          WHERE shop = ? AND id = ?
        `,
        ['processing', operationMetadata, timestamp, timestamp, timestamp, shop, executionRow.operation_id],
      );
    });
  }

  async markSucceeded(
    shop: string,
    operationId: string,
    operationMetadata: string,
    assignmentMetadata: string,
  ): Promise<void> {
    await this.db.transaction(async (transaction) => {
      const executionRow = await loadExecutionRow(transaction, shop, operationId);
      if (!executionRow || !executionRow.assignment_id) {
        throw new NotFoundError('Inventory operation not found while marking success');
      }

      const timestamp = nowIsoString();

      await transaction.run(
        `
          UPDATE blind_box_assignments
          SET
            status = ?,
            metadata = ?,
            updated_at = ?
          WHERE shop = ? AND id = ?
        `,
        ['inventory_committed', assignmentMetadata, timestamp, shop, executionRow.assignment_id],
      );

      await transaction.run(
        `
          UPDATE inventory_operations
          SET
            status = ?,
            metadata = ?,
            reason = NULL,
            completed_at = ?,
            updated_at = ?
          WHERE shop = ? AND id = ?
        `,
        ['succeeded', operationMetadata, timestamp, timestamp, shop, executionRow.operation_id],
      );
    });
  }

  async markFailed(
    shop: string,
    operationId: string,
    reason: string,
    operationMetadata: string,
    assignmentMetadata: string,
    options: {
      releaseReservedQuantity?: boolean;
      incrementAttemptCount?: boolean;
    } = {},
  ): Promise<void> {
    await this.db.transaction(async (transaction) => {
      const executionRow = await loadExecutionRow(transaction, shop, operationId);
      if (!executionRow || !executionRow.assignment_id) {
        throw new NotFoundError('Inventory operation not found while marking failure');
      }

      const timestamp = nowIsoString();

      if (
        options.releaseReservedQuantity &&
        executionRow.operation_status === 'processing' &&
        executionRow.pool_item_id
      ) {
        await transaction.run(
          `
            UPDATE blind_box_pool_items
            SET
              inventory_quantity = inventory_quantity + ?,
              updated_at = ?
            WHERE shop = ? AND id = ?
          `,
          [executionRow.quantity, timestamp, shop, executionRow.pool_item_id],
        );
      }

      await transaction.run(
        `
          UPDATE blind_box_assignments
          SET
            status = ?,
            metadata = ?,
            updated_at = ?
          WHERE shop = ? AND id = ?
        `,
        ['inventory_failed', assignmentMetadata, timestamp, shop, executionRow.assignment_id],
      );

      await transaction.run(
        `
          UPDATE inventory_operations
          SET
            status = ?,
            reason = ?,
            metadata = ?,
            attempt_count = CASE WHEN ? THEN attempt_count + 1 ELSE attempt_count END,
            last_attempted_at = ?,
            completed_at = ?,
            updated_at = ?
          WHERE shop = ? AND id = ?
        `,
        [
          'failed',
          reason,
          operationMetadata,
          options.incrementAttemptCount ? 1 : 0,
          timestamp,
          timestamp,
          timestamp,
          shop,
          executionRow.operation_id,
        ],
      );
    });
  }

  async markIndeterminate(
    shop: string,
    operationId: string,
    reason: string,
    operationMetadata: string,
    assignmentMetadata: string,
  ): Promise<void> {
    await this.db.transaction(async (transaction) => {
      const executionRow = await loadExecutionRow(transaction, shop, operationId);
      if (!executionRow || !executionRow.assignment_id) {
        throw new NotFoundError('Inventory operation not found while marking indeterminate state');
      }

      const timestamp = nowIsoString();

      await transaction.run(
        `
          UPDATE blind_box_assignments
          SET
            status = ?,
            metadata = ?,
            updated_at = ?
          WHERE shop = ? AND id = ?
        `,
        ['inventory_processing', assignmentMetadata, timestamp, shop, executionRow.assignment_id],
      );

      await transaction.run(
        `
          UPDATE inventory_operations
          SET
            status = ?,
            reason = ?,
            metadata = ?,
            updated_at = ?
          WHERE shop = ? AND id = ?
        `,
        ['processing', reason, operationMetadata, timestamp, shop, executionRow.operation_id],
      );
    });
  }
}

export async function getInventoryExecutionRepository(): Promise<InventoryExecutionRepository> {
  const db = await getBlindBoxDatabase();
  return new SqliteInventoryExecutionRepository(db);
}
