import { randomUUID } from 'crypto';
import { BlindBoxDatabase, getBlindBoxDatabase } from '../db/client';
import { NotFoundError } from '../lib/errors';
import { RecordWebhookEventInput, WebhookEvent } from '../domain/blind-box/types';
import { nowIsoString } from './helpers';

interface WebhookEventRow {
  id: string;
  shop: string;
  topic: string;
  event_id: string;
  status: WebhookEvent['status'];
  payload: string;
  error_message: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapWebhookEventRow(row: WebhookEventRow): WebhookEvent {
  return {
    id: row.id,
    shop: row.shop,
    topic: row.topic,
    eventId: row.event_id,
    status: row.status,
    payload: row.payload,
    errorMessage: row.error_message,
    processedAt: row.processed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface WebhookEventRepository {
  create(input: Required<RecordWebhookEventInput>): Promise<WebhookEvent>;
  findByShopAndEventId(shop: string, eventId: string): Promise<WebhookEvent | null>;
  updateStatus(
    shop: string,
    eventId: string,
    status: WebhookEvent['status'],
    errorMessage?: string | null,
  ): Promise<WebhookEvent>;
}

export class SqliteWebhookEventRepository implements WebhookEventRepository {
  constructor(private readonly db: BlindBoxDatabase) {}

  async create(input: Required<RecordWebhookEventInput>): Promise<WebhookEvent> {
    const id = randomUUID();
    const timestamp = nowIsoString();

    await this.db.run(
      `
        INSERT INTO webhook_events (
          id,
          shop,
          topic,
          event_id,
          status,
          payload,
          error_message,
          processed_at,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        input.shop,
        input.topic,
        input.eventId,
        input.status,
        input.payload,
        null,
        null,
        timestamp,
        timestamp,
      ],
    );

    const event = await this.findByShopAndEventId(input.shop, input.eventId);
    if (!event) {
      throw new NotFoundError('Failed to load the newly recorded webhook event');
    }

    return event;
  }

  async findByShopAndEventId(shop: string, eventId: string): Promise<WebhookEvent | null> {
    const row = await this.db.get<WebhookEventRow>(
      `
        SELECT
          id,
          shop,
          topic,
          event_id,
          status,
          payload,
          error_message,
          processed_at,
          created_at,
          updated_at
        FROM webhook_events
        WHERE shop = ? AND event_id = ?
      `,
      [shop, eventId],
    );

    return row ? mapWebhookEventRow(row) : null;
  }

  async updateStatus(
    shop: string,
    eventId: string,
    status: WebhookEvent['status'],
    errorMessage: string | null = null,
  ): Promise<WebhookEvent> {
    const timestamp = nowIsoString();
    const processedAt = status === 'processed' || status === 'ignored' ? timestamp : null;

    await this.db.run(
      `
        UPDATE webhook_events
        SET
          status = ?,
          error_message = ?,
          processed_at = ?,
          updated_at = ?
        WHERE shop = ? AND event_id = ?
      `,
      [status, errorMessage, processedAt, timestamp, shop, eventId],
    );

    const event = await this.findByShopAndEventId(shop, eventId);
    if (!event) {
      throw new NotFoundError('Webhook event not found after status update');
    }

    return event;
  }
}

export async function getWebhookEventRepository(): Promise<WebhookEventRepository> {
  const db = await getBlindBoxDatabase();
  return new SqliteWebhookEventRepository(db);
}
