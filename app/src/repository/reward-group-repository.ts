import { randomUUID } from 'crypto';
import { BlindBoxDatabase, getBlindBoxDatabase } from '../db/client';
import { ConflictError, NotFoundError } from '../lib/errors';
import {
  NormalizedUpsertRewardGroupInput,
  RewardGroup,
} from '../domain/blind-box/types';
import { isSqliteUniqueConstraintError, normalizeNullableString, nowIsoString } from './helpers';

interface RewardGroupRow {
  id: string;
  shop: string;
  source_type: RewardGroup['sourceType'];
  shopline_collection_id: string;
  collection_title_snapshot: string | null;
  status: RewardGroup['status'];
  config_json: string | null;
  created_at: string;
  updated_at: string;
}

function mapRewardGroupRow(row: RewardGroupRow): RewardGroup {
  return {
    id: row.id,
    shop: row.shop,
    sourceType: row.source_type,
    shoplineCollectionId: row.shopline_collection_id,
    collectionTitleSnapshot: normalizeNullableString(row.collection_title_snapshot),
    status: row.status,
    configJson: normalizeNullableString(row.config_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface RewardGroupRepository {
  upsert(shop: string, input: NormalizedUpsertRewardGroupInput): Promise<RewardGroup>;
  listByShop(shop: string): Promise<RewardGroup[]>;
  findById(shop: string, rewardGroupId: string): Promise<RewardGroup | null>;
  findByCollectionId(shop: string, collectionId: string): Promise<RewardGroup | null>;
}

export class SqliteRewardGroupRepository implements RewardGroupRepository {
  constructor(private readonly db: BlindBoxDatabase) {}

  async upsert(shop: string, input: NormalizedUpsertRewardGroupInput): Promise<RewardGroup> {
    const id = input.id || randomUUID();
    const existingRecord = input.id ? await this.findById(shop, id) : null;
    const timestamp = nowIsoString();

    try {
      if (existingRecord) {
        await this.db.run(
          `
            UPDATE reward_groups
            SET
              source_type = ?,
              shopline_collection_id = ?,
              collection_title_snapshot = ?,
              status = ?,
              config_json = ?,
              updated_at = ?
            WHERE shop = ? AND id = ?
          `,
          [
            input.sourceType,
            input.shoplineCollectionId,
            input.collectionTitleSnapshot,
            input.status,
            input.configJson,
            timestamp,
            shop,
            id,
          ],
        );
      } else {
        await this.db.run(
          `
            INSERT INTO reward_groups (
              id,
              shop,
              source_type,
              shopline_collection_id,
              collection_title_snapshot,
              status,
              config_json,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            id,
            shop,
            input.sourceType,
            input.shoplineCollectionId,
            input.collectionTitleSnapshot,
            input.status,
            input.configJson,
            timestamp,
            timestamp,
          ],
        );
      }
    } catch (error) {
      if (isSqliteUniqueConstraintError(error)) {
        throw new ConflictError('A reward group already exists for this SHOPLINE collection');
      }

      throw error;
    }

    const rewardGroup = await this.findById(shop, id);
    if (!rewardGroup) {
      throw new NotFoundError('Failed to load the saved reward group');
    }

    return rewardGroup;
  }

  async listByShop(shop: string): Promise<RewardGroup[]> {
    const rows = await this.db.all<RewardGroupRow>(
      `
        SELECT
          id,
          shop,
          source_type,
          shopline_collection_id,
          collection_title_snapshot,
          status,
          config_json,
          created_at,
          updated_at
        FROM reward_groups
        WHERE shop = ?
        ORDER BY created_at DESC
      `,
      [shop],
    );

    return rows.map(mapRewardGroupRow);
  }

  async findById(shop: string, rewardGroupId: string): Promise<RewardGroup | null> {
    const row = await this.db.get<RewardGroupRow>(
      `
        SELECT
          id,
          shop,
          source_type,
          shopline_collection_id,
          collection_title_snapshot,
          status,
          config_json,
          created_at,
          updated_at
        FROM reward_groups
        WHERE shop = ? AND id = ?
      `,
      [shop, rewardGroupId],
    );

    return row ? mapRewardGroupRow(row) : null;
  }

  async findByCollectionId(shop: string, collectionId: string): Promise<RewardGroup | null> {
    const row = await this.db.get<RewardGroupRow>(
      `
        SELECT
          id,
          shop,
          source_type,
          shopline_collection_id,
          collection_title_snapshot,
          status,
          config_json,
          created_at,
          updated_at
        FROM reward_groups
        WHERE shop = ? AND shopline_collection_id = ?
      `,
      [shop, collectionId],
    );

    return row ? mapRewardGroupRow(row) : null;
  }
}

export async function getRewardGroupRepository(): Promise<RewardGroupRepository> {
  const db = await getBlindBoxDatabase();
  return new SqliteRewardGroupRepository(db);
}
