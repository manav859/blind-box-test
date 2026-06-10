import { randomUUID } from 'crypto';
import { BlindBoxDatabase, getBlindBoxDatabase } from '../db/client';
import { NotFoundError } from '../lib/errors';
import { BlindBoxPoolItem, NormalizedUpsertBlindBoxPoolItemInput } from '../domain/blind-box/types';
import { normalizeNullableString, nowIsoString } from './helpers';

interface BlindBoxPoolItemRow {
  id: string;
  shop: string;
  blind_box_id: string;
  reward_product_id: string;
  reward_variant_id: string | null;
  reward_title_snapshot: string | null;
  created_at: string;
  updated_at: string;
}

function mapBlindBoxPoolItemRow(row: BlindBoxPoolItemRow): BlindBoxPoolItem {
  return {
    id: row.id,
    shop: row.shop,
    blindBoxId: row.blind_box_id,
    rewardProductId: row.reward_product_id,
    rewardVariantId: normalizeNullableString(row.reward_variant_id),
    rewardTitleSnapshot: normalizeNullableString(row.reward_title_snapshot),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS = `
  id,
  shop,
  blind_box_id,
  reward_product_id,
  reward_variant_id,
  reward_title_snapshot,
  created_at,
  updated_at
`;

export interface BlindBoxPoolItemRepository {
  upsert(shop: string, input: NormalizedUpsertBlindBoxPoolItemInput): Promise<BlindBoxPoolItem>;
  listByBlindBoxId(shop: string, blindBoxId: string): Promise<BlindBoxPoolItem[]>;
  findById(shop: string, poolItemId: string): Promise<BlindBoxPoolItem | null>;
  deleteById(shop: string, blindBoxId: string, poolItemId: string): Promise<void>;
}

export class SqliteBlindBoxPoolItemRepository implements BlindBoxPoolItemRepository {
  constructor(private readonly db: BlindBoxDatabase) {}

  async upsert(shop: string, input: NormalizedUpsertBlindBoxPoolItemInput): Promise<BlindBoxPoolItem> {
    const id = input.id || randomUUID();
    const existingRecord = input.id ? await this.findById(shop, id) : null;
    const timestamp = nowIsoString();

    if (existingRecord) {
      await this.db.run(
        `
          UPDATE blind_box_pool_items
          SET
            blind_box_id = ?,
            reward_product_id = ?,
            reward_variant_id = ?,
            reward_title_snapshot = ?,
            updated_at = ?
          WHERE shop = ? AND id = ?
        `,
        [
          input.blindBoxId,
          input.rewardProductId,
          input.rewardVariantId,
          input.rewardTitleSnapshot,
          timestamp,
          shop,
          id,
        ],
      );
    } else {
      await this.db.run(
        `
          INSERT INTO blind_box_pool_items (
            id,
            shop,
            blind_box_id,
            reward_product_id,
            reward_variant_id,
            reward_title_snapshot,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          id,
          shop,
          input.blindBoxId,
          input.rewardProductId,
          input.rewardVariantId,
          input.rewardTitleSnapshot,
          timestamp,
          timestamp,
        ],
      );
    }

    const poolItem = await this.findById(shop, id);
    if (!poolItem) {
      throw new NotFoundError('Failed to load the saved blind-box pool item');
    }

    return poolItem;
  }

  async listByBlindBoxId(shop: string, blindBoxId: string): Promise<BlindBoxPoolItem[]> {
    const rows = await this.db.all<BlindBoxPoolItemRow>(
      `
        SELECT ${SELECT_COLUMNS}
        FROM blind_box_pool_items
        WHERE shop = ? AND blind_box_id = ?
        ORDER BY created_at DESC
      `,
      [shop, blindBoxId],
    );

    return rows.map(mapBlindBoxPoolItemRow);
  }

  async findById(shop: string, poolItemId: string): Promise<BlindBoxPoolItem | null> {
    const row = await this.db.get<BlindBoxPoolItemRow>(
      `
        SELECT ${SELECT_COLUMNS}
        FROM blind_box_pool_items
        WHERE shop = ? AND id = ?
      `,
      [shop, poolItemId],
    );

    return row ? mapBlindBoxPoolItemRow(row) : null;
  }

  async deleteById(shop: string, blindBoxId: string, poolItemId: string): Promise<void> {
    await this.db.run(
      'DELETE FROM blind_box_pool_items WHERE shop = ? AND blind_box_id = ? AND id = ?',
      [shop, blindBoxId, poolItemId],
    );
  }
}

export async function getBlindBoxPoolItemRepository(): Promise<BlindBoxPoolItemRepository> {
  const db = await getBlindBoxDatabase();
  return new SqliteBlindBoxPoolItemRepository(db);
}
