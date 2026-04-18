import { randomUUID } from 'crypto';
import { BlindBoxDatabase, getBlindBoxDatabase } from '../db/client';
import { ConflictError, NotFoundError } from '../lib/errors';
import { BlindBoxAssignment, NormalizedCreateBlindBoxAssignmentInput } from '../domain/blind-box/types';
import { isSqliteUniqueConstraintError, normalizeNullableString, nowIsoString } from './helpers';

interface BlindBoxAssignmentRow {
  id: string;
  shop: string;
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
  selection_strategy: BlindBoxAssignment['selectionStrategy'];
  idempotency_key: string;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

function mapBlindBoxAssignmentRow(row: BlindBoxAssignmentRow): BlindBoxAssignment {
  return {
    id: row.id,
    shop: row.shop,
    blindBoxId: row.blind_box_id,
    orderId: row.order_id,
    orderLineId: row.order_line_id,
    rewardGroupId: normalizeNullableString(row.reward_group_id),
    selectedPoolItemId: normalizeNullableString(row.selected_pool_item_id),
    selectedRewardProductId: normalizeNullableString(row.selected_reward_product_id),
    selectedRewardVariantId: normalizeNullableString(row.selected_reward_variant_id),
    selectedRewardTitleSnapshot: normalizeNullableString(row.selected_reward_title_snapshot),
    selectedRewardVariantTitleSnapshot: normalizeNullableString(row.selected_reward_variant_title_snapshot),
    selectedRewardPayloadJson: normalizeNullableString(row.selected_reward_payload_json),
    status: row.status,
    selectionStrategy: normalizeNullableString(row.selection_strategy) as BlindBoxAssignment['selectionStrategy'],
    idempotencyKey: row.idempotency_key,
    metadata: normalizeNullableString(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface BlindBoxAssignmentRepository {
  create(shop: string, input: NormalizedCreateBlindBoxAssignmentInput): Promise<BlindBoxAssignment>;
  listByShop(shop: string): Promise<BlindBoxAssignment[]>;
  findByOrderLine(shop: string, orderId: string, orderLineId: string): Promise<BlindBoxAssignment | null>;
  findById(shop: string, assignmentId: string): Promise<BlindBoxAssignment | null>;
  updateStatus(
    shop: string,
    assignmentId: string,
    status: BlindBoxAssignment['status'],
    metadata?: string | null,
  ): Promise<BlindBoxAssignment>;
}

export class SqliteBlindBoxAssignmentRepository implements BlindBoxAssignmentRepository {
  constructor(private readonly db: BlindBoxDatabase) {}

  async create(shop: string, input: NormalizedCreateBlindBoxAssignmentInput): Promise<BlindBoxAssignment> {
    const id = randomUUID();
    const timestamp = nowIsoString();

    try {
      await this.db.run(
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
          id,
          shop,
          input.blindBoxId,
          input.orderId,
          input.orderLineId,
          input.rewardGroupId,
          input.selectedPoolItemId,
          input.selectedRewardProductId,
          input.selectedRewardVariantId,
          input.selectedRewardTitleSnapshot,
          input.selectedRewardVariantTitleSnapshot,
          input.selectedRewardPayloadJson,
          input.status,
          input.selectionStrategy,
          input.idempotencyKey,
          input.metadata,
          timestamp,
          timestamp,
        ],
      );
    } catch (error) {
      if (isSqliteUniqueConstraintError(error)) {
        throw new ConflictError('A blind-box assignment already exists for this order line or idempotency key');
      }

      throw error;
    }

    const assignment = await this.findByOrderLine(shop, input.orderId, input.orderLineId);
    if (!assignment) {
      throw new NotFoundError('Failed to load the newly created blind-box assignment');
    }

    return assignment;
  }

  async listByShop(shop: string): Promise<BlindBoxAssignment[]> {
    const rows = await this.db.all<BlindBoxAssignmentRow>(
      `
        SELECT
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
        FROM blind_box_assignments
        WHERE shop = ?
        ORDER BY created_at DESC
      `,
      [shop],
    );

    return rows.map(mapBlindBoxAssignmentRow);
  }

  async findByOrderLine(shop: string, orderId: string, orderLineId: string): Promise<BlindBoxAssignment | null> {
    const row = await this.db.get<BlindBoxAssignmentRow>(
      `
        SELECT
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
        FROM blind_box_assignments
        WHERE shop = ? AND order_id = ? AND order_line_id = ?
      `,
      [shop, orderId, orderLineId],
    );

    return row ? mapBlindBoxAssignmentRow(row) : null;
  }

  async findById(shop: string, assignmentId: string): Promise<BlindBoxAssignment | null> {
    const row = await this.db.get<BlindBoxAssignmentRow>(
      `
        SELECT
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
        FROM blind_box_assignments
        WHERE shop = ? AND id = ?
      `,
      [shop, assignmentId],
    );

    return row ? mapBlindBoxAssignmentRow(row) : null;
  }

  async updateStatus(
    shop: string,
    assignmentId: string,
    status: BlindBoxAssignment['status'],
    metadata: string | null = null,
  ): Promise<BlindBoxAssignment> {
    const timestamp = nowIsoString();

    await this.db.run(
      `
        UPDATE blind_box_assignments
        SET
          status = ?,
          metadata = COALESCE(?, metadata),
          updated_at = ?
        WHERE shop = ? AND id = ?
      `,
      [status, metadata, timestamp, shop, assignmentId],
    );

    const assignment = await this.findById(shop, assignmentId);
    if (!assignment) {
      throw new NotFoundError('Blind-box assignment not found after status update');
    }

    return assignment;
  }
}

export async function getBlindBoxAssignmentRepository(): Promise<BlindBoxAssignmentRepository> {
  const db = await getBlindBoxDatabase();
  return new SqliteBlindBoxAssignmentRepository(db);
}
