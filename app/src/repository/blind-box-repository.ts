import { randomUUID } from 'crypto';
import { BlindBoxDatabase, getBlindBoxDatabase } from '../db/client';
import { ConflictError, NotFoundError } from '../lib/errors';
import { BlindBox, NormalizedCreateBlindBoxInput } from '../domain/blind-box/types';
import { isSqliteUniqueConstraintError, nowIsoString } from './helpers';

interface BlindBoxRow {
  id: string;
  shop: string;
  name: string;
  description: string | null;
  status: BlindBox['status'];
  selection_strategy: BlindBox['selectionStrategy'];
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface BlindBoxRepository {
  create(shop: string, input: NormalizedCreateBlindBoxInput): Promise<BlindBox>;
  update(shop: string, blindBoxId: string, input: NormalizedCreateBlindBoxInput): Promise<BlindBox>;
  listByShop(shop: string): Promise<BlindBox[]>;
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
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          id,
          shop,
          input.name,
          input.description,
          input.status,
          input.selectionStrategy,
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
          updated_at = ?
        WHERE shop = ? AND id = ?
      `,
      [
        input.name,
        input.description,
        input.status,
        input.selectionStrategy,
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
