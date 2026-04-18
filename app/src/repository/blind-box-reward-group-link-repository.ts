import { randomUUID } from 'crypto';
import { BlindBoxDatabase, getBlindBoxDatabase } from '../db/client';
import { ConflictError, NotFoundError } from '../lib/errors';
import {
  BlindBoxRewardGroupLink,
  NormalizedUpsertBlindBoxRewardGroupLinkInput,
} from '../domain/blind-box/types';
import { isSqliteUniqueConstraintError, nowIsoString } from './helpers';

interface BlindBoxRewardGroupLinkRow {
  id: string;
  shop: string;
  blind_box_id: string;
  reward_group_id: string;
  created_at: string;
  updated_at: string;
}

function mapBlindBoxRewardGroupLinkRow(row: BlindBoxRewardGroupLinkRow): BlindBoxRewardGroupLink {
  return {
    id: row.id,
    shop: row.shop,
    blindBoxId: row.blind_box_id,
    rewardGroupId: row.reward_group_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface BlindBoxRewardGroupLinkRepository {
  upsert(
    shop: string,
    input: NormalizedUpsertBlindBoxRewardGroupLinkInput,
  ): Promise<BlindBoxRewardGroupLink>;
  listByShop(shop: string): Promise<BlindBoxRewardGroupLink[]>;
  findByBlindBoxId(shop: string, blindBoxId: string): Promise<BlindBoxRewardGroupLink | null>;
  findById(shop: string, linkId: string): Promise<BlindBoxRewardGroupLink | null>;
}

export class SqliteBlindBoxRewardGroupLinkRepository implements BlindBoxRewardGroupLinkRepository {
  constructor(private readonly db: BlindBoxDatabase) {}

  async upsert(
    shop: string,
    input: NormalizedUpsertBlindBoxRewardGroupLinkInput,
  ): Promise<BlindBoxRewardGroupLink> {
    const existingRecord = input.id
      ? await this.findById(shop, input.id)
      : await this.findByBlindBoxId(shop, input.blindBoxId);
    const id = existingRecord?.id || input.id || randomUUID();
    const timestamp = nowIsoString();

    try {
      if (existingRecord) {
        await this.db.run(
          `
            UPDATE blind_box_reward_group_links
            SET
              blind_box_id = ?,
              reward_group_id = ?,
              updated_at = ?
            WHERE shop = ? AND id = ?
          `,
          [input.blindBoxId, input.rewardGroupId, timestamp, shop, id],
        );
      } else {
        await this.db.run(
          `
            INSERT INTO blind_box_reward_group_links (
              id,
              shop,
              blind_box_id,
              reward_group_id,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?)
          `,
          [id, shop, input.blindBoxId, input.rewardGroupId, timestamp, timestamp],
        );
      }
    } catch (error) {
      if (isSqliteUniqueConstraintError(error)) {
        throw new ConflictError('A reward group link already exists for this blind-box reference');
      }

      throw error;
    }

    const link = await this.findById(shop, id);
    if (!link) {
      throw new NotFoundError('Failed to load the saved blind-box reward group link');
    }

    return link;
  }

  async listByShop(shop: string): Promise<BlindBoxRewardGroupLink[]> {
    const rows = await this.db.all<BlindBoxRewardGroupLinkRow>(
      `
        SELECT
          id,
          shop,
          blind_box_id,
          reward_group_id,
          created_at,
          updated_at
        FROM blind_box_reward_group_links
        WHERE shop = ?
        ORDER BY created_at DESC
      `,
      [shop],
    );

    return rows.map(mapBlindBoxRewardGroupLinkRow);
  }

  async findByBlindBoxId(shop: string, blindBoxId: string): Promise<BlindBoxRewardGroupLink | null> {
    const row = await this.db.get<BlindBoxRewardGroupLinkRow>(
      `
        SELECT
          id,
          shop,
          blind_box_id,
          reward_group_id,
          created_at,
          updated_at
        FROM blind_box_reward_group_links
        WHERE shop = ? AND blind_box_id = ?
      `,
      [shop, blindBoxId],
    );

    return row ? mapBlindBoxRewardGroupLinkRow(row) : null;
  }

  async findById(shop: string, linkId: string): Promise<BlindBoxRewardGroupLink | null> {
    const row = await this.db.get<BlindBoxRewardGroupLinkRow>(
      `
        SELECT
          id,
          shop,
          blind_box_id,
          reward_group_id,
          created_at,
          updated_at
        FROM blind_box_reward_group_links
        WHERE shop = ? AND id = ?
      `,
      [shop, linkId],
    );

    return row ? mapBlindBoxRewardGroupLinkRow(row) : null;
  }
}

export async function getBlindBoxRewardGroupLinkRepository(): Promise<BlindBoxRewardGroupLinkRepository> {
  const db = await getBlindBoxDatabase();
  return new SqliteBlindBoxRewardGroupLinkRepository(db);
}
