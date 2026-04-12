import { randomUUID } from 'crypto';
import { BlindBoxDatabase, getBlindBoxDatabase } from '../db/client';
import { NotFoundError } from '../lib/errors';
import { BlindBoxPoolItem, NormalizedUpsertBlindBoxPoolItemInput } from '../domain/blind-box/types';
import { fromSqliteBoolean, toSqliteBoolean } from '../domain/blind-box/validation';
import { normalizeNullableString, nowIsoString } from './helpers';

interface BlindBoxPoolItemRow {
  id: string;
  shop: string;
  blind_box_id: string;
  label: string;
  source_product_id: string | null;
  source_variant_id: string | null;
  enabled: number;
  weight: number;
  inventory_quantity: number;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

function mapBlindBoxPoolItemRow(row: BlindBoxPoolItemRow): BlindBoxPoolItem {
  return {
    id: row.id,
    shop: row.shop,
    blindBoxId: row.blind_box_id,
    label: row.label,
    sourceProductId: normalizeNullableString(row.source_product_id),
    sourceVariantId: normalizeNullableString(row.source_variant_id),
    enabled: fromSqliteBoolean(row.enabled),
    weight: row.weight,
    inventoryQuantity: row.inventory_quantity,
    metadata: normalizeNullableString(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface BlindBoxPoolItemRepository {
  upsert(shop: string, input: NormalizedUpsertBlindBoxPoolItemInput): Promise<BlindBoxPoolItem>;
  listByBlindBoxId(shop: string, blindBoxId: string): Promise<BlindBoxPoolItem[]>;
  findById(shop: string, poolItemId: string): Promise<BlindBoxPoolItem | null>;
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
            label = ?,
            source_product_id = ?,
            source_variant_id = ?,
            enabled = ?,
            weight = ?,
            inventory_quantity = ?,
            metadata = ?,
            updated_at = ?
          WHERE shop = ? AND id = ?
        `,
        [
          input.blindBoxId,
          input.label,
          input.sourceProductId,
          input.sourceVariantId,
          toSqliteBoolean(input.enabled),
          input.weight,
          input.inventoryQuantity,
          input.metadata,
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
            label,
            source_product_id,
            source_variant_id,
            enabled,
            weight,
            inventory_quantity,
            metadata,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          id,
          shop,
          input.blindBoxId,
          input.label,
          input.sourceProductId,
          input.sourceVariantId,
          toSqliteBoolean(input.enabled),
          input.weight,
          input.inventoryQuantity,
          input.metadata,
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
        SELECT
          id,
          shop,
          blind_box_id,
          label,
          source_product_id,
          source_variant_id,
          enabled,
          weight,
          inventory_quantity,
          metadata,
          created_at,
          updated_at
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
        SELECT
          id,
          shop,
          blind_box_id,
          label,
          source_product_id,
          source_variant_id,
          enabled,
          weight,
          inventory_quantity,
          metadata,
          created_at,
          updated_at
        FROM blind_box_pool_items
        WHERE shop = ? AND id = ?
      `,
      [shop, poolItemId],
    );

    return row ? mapBlindBoxPoolItemRow(row) : null;
  }
}

export async function getBlindBoxPoolItemRepository(): Promise<BlindBoxPoolItemRepository> {
  const db = await getBlindBoxDatabase();
  return new SqliteBlindBoxPoolItemRepository(db);
}
