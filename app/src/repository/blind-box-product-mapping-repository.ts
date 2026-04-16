import { randomUUID } from 'crypto';
import { BlindBoxDatabase, getBlindBoxDatabase } from '../db/client';
import { ConflictError, NotFoundError } from '../lib/errors';
import {
  BlindBoxProductMapping,
  NormalizedUpsertBlindBoxProductMappingInput,
} from '../domain/blind-box/types';
import { fromSqliteBoolean, toSqliteBoolean } from '../domain/blind-box/validation';
import { isSqliteUniqueConstraintError, normalizeNullableString, nowIsoString, sqliteVariantKey } from './helpers';

interface BlindBoxProductMappingRow {
  id: string;
  shop: string;
  blind_box_id: string;
  product_id: string;
  product_variant_id: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

function mapBlindBoxProductMappingRow(row: BlindBoxProductMappingRow): BlindBoxProductMapping {
  return {
    id: row.id,
    shop: row.shop,
    blindBoxId: row.blind_box_id,
    productId: row.product_id,
    productVariantId: normalizeNullableString(row.product_variant_id),
    enabled: fromSqliteBoolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface BlindBoxProductMappingRepository {
  upsert(shop: string, input: NormalizedUpsertBlindBoxProductMappingInput): Promise<BlindBoxProductMapping>;
  listByShop(shop: string): Promise<BlindBoxProductMapping[]>;
  listEnabledByProduct(shop: string, productId: string): Promise<BlindBoxProductMapping[]>;
  findById(shop: string, mappingId: string): Promise<BlindBoxProductMapping | null>;
}

export class SqliteBlindBoxProductMappingRepository implements BlindBoxProductMappingRepository {
  constructor(private readonly db: BlindBoxDatabase) {}

  async upsert(shop: string, input: NormalizedUpsertBlindBoxProductMappingInput): Promise<BlindBoxProductMapping> {
    const id = input.id || randomUUID();
    const timestamp = nowIsoString();
    const variantKey = sqliteVariantKey(input.productVariantId);
    const existingRecord = input.id ? await this.findById(shop, id) : null;

    try {
      if (existingRecord) {
        await this.db.run(
          `
            UPDATE blind_box_product_mappings
            SET
              blind_box_id = ?,
              product_id = ?,
              product_variant_id = ?,
              enabled = ?,
              updated_at = ?
            WHERE shop = ? AND id = ?
          `,
          [
            input.blindBoxId,
            input.productId,
            variantKey,
            toSqliteBoolean(input.enabled),
            timestamp,
            shop,
            id,
          ],
        );
      } else {
        await this.db.run(
          `
            INSERT INTO blind_box_product_mappings (
              id,
              shop,
              blind_box_id,
              product_id,
              product_variant_id,
              enabled,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            id,
            shop,
            input.blindBoxId,
            input.productId,
            variantKey,
            toSqliteBoolean(input.enabled),
            timestamp,
            timestamp,
          ],
        );
      }
    } catch (error) {
      if (isSqliteUniqueConstraintError(error)) {
        throw new ConflictError('A product mapping already exists for this product and variant');
      }

      throw error;
    }

    const mapping = await this.findById(shop, id);
    if (!mapping) {
      throw new NotFoundError('Failed to load the saved blind-box product mapping');
    }

    return mapping;
  }

  async listByShop(shop: string): Promise<BlindBoxProductMapping[]> {
    const rows = await this.db.all<BlindBoxProductMappingRow>(
      `
        SELECT
          id,
          shop,
          blind_box_id,
          product_id,
          product_variant_id,
          enabled,
          created_at,
          updated_at
        FROM blind_box_product_mappings
        WHERE shop = ?
        ORDER BY created_at DESC
      `,
      [shop],
    );

    return rows.map(mapBlindBoxProductMappingRow);
  }

  async listEnabledByProduct(shop: string, productId: string): Promise<BlindBoxProductMapping[]> {
    const rows = await this.db.all<BlindBoxProductMappingRow>(
      `
        SELECT
          id,
          shop,
          blind_box_id,
          product_id,
          product_variant_id,
          enabled,
          created_at,
          updated_at
        FROM blind_box_product_mappings
        WHERE shop = ? AND product_id = ? AND enabled = 1
        ORDER BY created_at DESC
      `,
      [shop, productId],
    );

    return rows.map(mapBlindBoxProductMappingRow);
  }

  async findById(shop: string, mappingId: string): Promise<BlindBoxProductMapping | null> {
    const row = await this.db.get<BlindBoxProductMappingRow>(
      `
        SELECT
          id,
          shop,
          blind_box_id,
          product_id,
          product_variant_id,
          enabled,
          created_at,
          updated_at
        FROM blind_box_product_mappings
        WHERE shop = ? AND id = ?
      `,
      [shop, mappingId],
    );

    return row ? mapBlindBoxProductMappingRow(row) : null;
  }
}

export async function getBlindBoxProductMappingRepository(): Promise<BlindBoxProductMappingRepository> {
  const db = await getBlindBoxDatabase();
  return new SqliteBlindBoxProductMappingRepository(db);
}
