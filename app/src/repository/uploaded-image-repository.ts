import { randomUUID } from 'crypto';
import { BlindBoxDatabase, getBlindBoxDatabase } from '../db/client';
import { nowIsoString } from './helpers';

export interface UploadedImage {
  id: string;
  shop: string;
  contentType: string;
  dataBase64: string;
  createdAt: string;
}

interface UploadedImageRow {
  id: string;
  shop: string;
  content_type: string;
  data_base64: string;
  created_at: string;
}

export interface UploadedImageRepository {
  create(shop: string, contentType: string, dataBase64: string): Promise<UploadedImage>;
  /** Public lookup by id only — image URLs must work without a shop session. */
  findById(imageId: string): Promise<UploadedImage | null>;
}

export class SqliteUploadedImageRepository implements UploadedImageRepository {
  constructor(private readonly db: BlindBoxDatabase) {}

  async create(shop: string, contentType: string, dataBase64: string): Promise<UploadedImage> {
    const id = randomUUID();
    const timestamp = nowIsoString();

    await this.db.run(
      `
        INSERT INTO uploaded_images (id, shop, content_type, data_base64, created_at)
        VALUES (?, ?, ?, ?, ?)
      `,
      [id, shop, contentType, dataBase64, timestamp],
    );

    return { id, shop, contentType, dataBase64, createdAt: timestamp };
  }

  async findById(imageId: string): Promise<UploadedImage | null> {
    const row = await this.db.get<UploadedImageRow>(
      'SELECT id, shop, content_type, data_base64, created_at FROM uploaded_images WHERE id = ?',
      [imageId],
    );

    return row
      ? {
          id: row.id,
          shop: row.shop,
          contentType: row.content_type,
          dataBase64: row.data_base64,
          createdAt: row.created_at,
        }
      : null;
  }
}

export async function getUploadedImageRepository(): Promise<UploadedImageRepository> {
  const db = await getBlindBoxDatabase();
  return new SqliteUploadedImageRepository(db);
}
