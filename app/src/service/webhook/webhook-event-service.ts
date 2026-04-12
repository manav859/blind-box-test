import { createHash } from 'crypto';
import { IncomingHttpHeaders } from 'http';
import { RecordWebhookEventInput, WebhookEvent } from '../../domain/blind-box/types';
import { getWebhookEventRepository, WebhookEventRepository } from '../../repository/webhook-event-repository';

function firstHeaderValue(value?: string | string[]): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export class WebhookEventService {
  constructor(private readonly webhookEventRepository: WebhookEventRepository) {}

  buildEventId(headers: IncomingHttpHeaders, shop: string, topic: string, payload: unknown): string {
    const explicitEventId =
      firstHeaderValue(headers['x-shopline-webhook-id']) ||
      firstHeaderValue(headers['x-shopline-event-id']) ||
      firstHeaderValue(headers['x-webhook-id']) ||
      firstHeaderValue(headers['x-request-id']) ||
      firstHeaderValue(headers['traceid']);

    if (explicitEventId) {
      return explicitEventId;
    }

    const payloadFingerprint = createHash('sha256')
      .update(JSON.stringify(payload || {}))
      .digest('hex');

    return `${shop}:${topic}:${payloadFingerprint}`;
  }

  async recordReceivedEvent(input: RecordWebhookEventInput): Promise<WebhookEvent> {
    const existingEvent = await this.webhookEventRepository.findByShopAndEventId(input.shop, input.eventId);
    if (existingEvent) {
      return existingEvent;
    }

    return this.webhookEventRepository.create({
      ...input,
      status: input.status || 'received',
    });
  }

  async markProcessed(shop: string, eventId: string): Promise<WebhookEvent> {
    return this.webhookEventRepository.updateStatus(shop, eventId, 'processed');
  }

  async markProcessing(shop: string, eventId: string): Promise<WebhookEvent> {
    return this.webhookEventRepository.updateStatus(shop, eventId, 'processing');
  }

  async markIgnored(shop: string, eventId: string): Promise<WebhookEvent> {
    return this.webhookEventRepository.updateStatus(shop, eventId, 'ignored');
  }

  async markFailed(shop: string, eventId: string, errorMessage: string): Promise<WebhookEvent> {
    return this.webhookEventRepository.updateStatus(shop, eventId, 'failed', errorMessage);
  }
}

export async function getWebhookEventService(): Promise<WebhookEventService> {
  const repository = await getWebhookEventRepository();
  return new WebhookEventService(repository);
}
