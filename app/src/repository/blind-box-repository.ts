import { randomUUID } from 'crypto';
import { BlindBoxDatabase, getBlindBoxDatabase } from '../db/client';
import { ConflictError, NotFoundError } from '../lib/errors';
import { BlindBox, NormalizedCreateBlindBoxInput } from '../domain/blind-box/types';
import {
  isSqliteUniqueConstraintError,
  normalizeNullableString,
  nowIsoString,
  sqliteVariantKey,
} from './helpers';

interface BlindBoxRow {
  id: string;
  shop: string;
  name: string;
  description: string | null;
  status: BlindBox['status'];
  selection_strategy: BlindBox['selectionStrategy'];
  shopline_product_id: string | null;
  shopline_variant_id: string | null;
  product_title_snapshot: string | null;
  config_json: string | null;
  created_at: string;
  updated_at: string;
}

function mapBlindBoxRow(row: BlindBoxRow): BlindBox {
  return {
    id: row.id,
    shop: row.shop,
    name: row.name,
    description: row.description,
    status: row.status,
    selectionStrategy: row.selection_strategy,
    shoplineProductId: normalizeNullableString(row.shopline_product_id),
    shoplineVariantId: normalizeNullableString(row.shopline_variant_id),
    productTitleSnapshot: normalizeNullableString(row.product_title_snapshot),
    configJson: normalizeNullableString(row.config_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface BlindBoxRepository {
  create(shop: string, input: NormalizedCreateBlindBoxInput): Promise<BlindBox>;
  update(shop: string, blindBoxId: string, input: NormalizedCreateBlindBoxInput): Promise<BlindBox>;
  listByShop(shop: string): Promise<BlindBox[]>;
  listByShoplineProductId(shop: string, shoplineProductId: string): Promise<BlindBox[]>;
  findById(shop: string, blindBoxId: string): Promise<BlindBox | null>;
}

export class SqliteBlindBoxRepository implements BlindBoxRepository {
  constructor(private readonly db: BlindBoxDatabase) {}

  async create(shop: string, input: NormalizedCreateBlindBoxInput): Promise<BlindBox> {
    const id = randomUUID();
    const timestamp = nowIsoString();

    try {
      await this.db.run(
        `
          INSERT INTO blind_boxes (
            id,
            shop,
            name,
            description,
            status,
            selection_strategy,
            shopline_product_id,
            shopline_variant_id,
            product_title_snapshot,
            config_json,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          id,
          shop,
          input.name,
          input.description,
          input.status,
          input.selectionStrategy,
          input.shoplineProductId,
          sqliteVariantKey(input.shoplineVariantId),
          input.productTitleSnapshot,
          input.configJson,
          timestamp,
          timestamp,
        ],
      );
    } catch (error) {
      if (isSqliteUniqueConstraintError(error)) {
        throw new ConflictError('A blind box with the same unique key already exists');
      }

      throw error;
    }

    const blindBox = await this.findById(shop, id);
    if (!blindBox) {
      throw new NotFoundError('Failed to load the newly created blind box');
    }

    return blindBox;
  }

  async update(shop: string, blindBoxId: string, input: NormalizedCreateBlindBoxInput): Promise<BlindBox> {
    const timestamp = nowIsoString();

    await this.db.run(
      `
        UPDATE blind_boxes
        SET
          name = ?,
          description = ?,
          status = ?,
          selection_strategy = ?,
          shopline_product_id = ?,
          shopline_variant_id = ?,
          product_title_snapshot = ?,
          config_json = ?,
          updated_at = ?
        WHERE shop = ? AND id = ?
      `,
      [
        input.name,
        input.description,
        input.status,
        input.selectionStrategy,
        input.shoplineProductId,
        sqliteVariantKey(input.shoplineVariantId),
        input.productTitleSnapshot,
        input.configJson,
        timestamp,
        shop,
        blindBoxId,
      ],
    );

    const blindBox = await this.findById(shop, blindBoxId);
    if (!blindBox) {
      throw new NotFoundError('Blind box not found');
    }

    return blindBox;
  }

  async listByShop(shop: string): Promise<BlindBox[]> {
    const rows = await this.db.all<BlindBoxRow>(
      `
        SELECT
          id,
          shop,
          name,
          description,
          status,
          selection_strategy,
          shopline_product_id,
          shopline_variant_id,
          product_title_snapshot,
          config_json,
          created_at,
          updated_at
        FROM blind_boxes
        WHERE shop = ?
        ORDER BY created_at DESC
      `,
      [shop],
    );

    return rows.map(mapBlindBoxRow);
  }

  async listByShoplineProductId(shop: string, shoplineProductId: string): Promise<BlindBox[]> {
    const rows = await this.db.all<BlindBoxRow>(
      `
        SELECT
          id,
          shop,
          name,
          description,
          status,
          selection_strategy,
          shopline_product_id,
          shopline_variant_id,
          product_title_snapshot,
          config_json,
          created_at,
          updated_at
        FROM blind_boxes
        WHERE shop = ? AND shopline_product_id = ?
        ORDER BY updated_at DESC, created_at DESC
      `,
      [shop, shoplineProductId],
    );

    return rows.map(mapBlindBoxRow);
  }

  async findById(shop: string, blindBoxId: string): Promise<BlindBox | null> {
    const row = await this.db.get<BlindBoxRow>(
      `
        SELECT
          id,
          shop,
          name,
          description,
          status,
          selection_strategy,
          shopline_product_id,
          shopline_variant_id,
          product_title_snapshot,
          config_json,
          created_at,
          updated_at
        FROM blind_boxes
        WHERE shop = ? AND id = ?
      `,
      [shop, blindBoxId],
    );

    return row ? mapBlindBoxRow(row) : null;
  }
}

export async function getBlindBoxRepository(): Promise<BlindBoxRepository> {
  const db = await getBlindBoxDatabase();
  return new SqliteBlindBoxRepository(db);
}
