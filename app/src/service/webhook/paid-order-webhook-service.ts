import { IncomingHttpHeaders } from 'http';
import { OrderPaidWebhookPayload } from '../../domain/blind-box/order-paid';
import { logger, Logger } from '../../lib/logger';
import { WebhookEventService, getWebhookEventService } from './webhook-event-service';
import {
  AssignmentProcessingFailure,
  getPaidOrderAssignmentService,
  PaidOrderAssignmentService,
} from '../blind-box/paid-order-assignment-service';
import { WebhookEvent } from '../../domain/blind-box/types';

export interface PaidOrderWebhookProcessingResult {
  eventId: string;
  status: 'processed' | 'ignored' | 'duplicate' | 'failed';
  shouldAcknowledge: boolean;
  summary: Record<string, unknown>;
}

export interface PaidOrderWebhookServiceDependencies {
  webhookEventService: WebhookEventService;
  paidOrderAssignmentService: PaidOrderAssignmentService;
  logger: Logger;
}

function firstHeaderValue(value?: string | string[]): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function getShopFromHeaders(headers: IncomingHttpHeaders): string {
  const shopDomain = firstHeaderValue(headers['x-shopline-shop-domain']);
  if (!shopDomain) {
    return '';
  }

  return shopDomain.replace(/\.myshopline\.com$/i, '');
}

function summarizeFailures(failures: AssignmentProcessingFailure[]): string {
  return JSON.stringify(
    failures.map((failure) => ({
      blindBoxId: failure.blindBoxId,
      lineItemId: failure.lineItemId,
      orderId: failure.orderId,
      reason: failure.reason,
      message: failure.message,
    })),
  );
}

function isDuplicateTerminalEvent(event: WebhookEvent): boolean {
  return event.status === 'processed' || event.status === 'ignored';
}

export class PaidOrderWebhookService {
  constructor(private readonly dependencies: PaidOrderWebhookServiceDependencies) {}

  async processPaidOrderWebhook(
    headers: IncomingHttpHeaders,
    payload: OrderPaidWebhookPayload,
  ): Promise<PaidOrderWebhookProcessingResult> {
    const shop = getShopFromHeaders(headers);
    const topic = 'orders/paid';
    const eventId = this.dependencies.webhookEventService.buildEventId(headers, shop, topic, payload);
    const existingEvent = await this.dependencies.webhookEventService.recordReceivedEvent({
      shop,
      topic,
      eventId,
      payload: JSON.stringify(payload || {}),
    });

    if (isDuplicateTerminalEvent(existingEvent)) {
      return {
        eventId,
        status: 'duplicate',
        shouldAcknowledge: true,
        summary: {
          message: 'Duplicate processed webhook event',
          eventStatus: existingEvent.status,
        },
      };
    }

    await this.dependencies.webhookEventService.markProcessing(shop, eventId);

    const processingSummary = await this.dependencies.paidOrderAssignmentService.processPaidOrder(shop, payload);

    if (!processingSummary.matchedLineCount) {
      await this.dependencies.webhookEventService.markIgnored(
        shop,
        eventId,
      );

      return {
        eventId,
        status: 'ignored',
        shouldAcknowledge: true,
        summary: {
          message: 'No blind-box product mapping matched this paid order',
          detectedLineCount: processingSummary.detectedLineCount,
          ignoredDetections: processingSummary.ignoredDetections,
        },
      };
    }

    if (processingSummary.failures.length) {
      const failureMessage = summarizeFailures(processingSummary.failures);
      await this.dependencies.webhookEventService.markFailed(shop, eventId, failureMessage);

      this.dependencies.logger.error('Paid order webhook processing failed', {
        shop,
        eventId,
        failures: processingSummary.failures,
      });

      return {
        eventId,
        status: 'failed',
        shouldAcknowledge: false,
        summary: {
          assignments: processingSummary.assignments,
          failures: processingSummary.failures,
        },
      };
    }

    await this.dependencies.webhookEventService.markProcessed(shop, eventId);
    this.dependencies.logger.info('Blind-box assignments completed from paid-order webhook', {
      shop,
      eventId,
      assignmentCount: processingSummary.assignments.length,
      assignments: processingSummary.assignments.map((assignment) => ({
        blindBoxId: assignment.blindBoxId,
        orderId: assignment.orderId,
        lineItemId: assignment.lineItemId,
        assignmentId: assignment.assignmentId,
        selectedPoolItemId: assignment.selectedPoolItemId,
        inventoryStatus: assignment.inventoryStatus,
      })),
    });

    return {
      eventId,
      status: 'processed',
      shouldAcknowledge: true,
      summary: {
        assignments: processingSummary.assignments,
        ignoredDetections: processingSummary.ignoredDetections,
      },
    };
  }
}

export async function getPaidOrderWebhookService(): Promise<PaidOrderWebhookService> {
  const webhookEventService = await getWebhookEventService();
  const paidOrderAssignmentService = await getPaidOrderAssignmentService();

  return new PaidOrderWebhookService({
    webhookEventService,
    paidOrderAssignmentService,
    logger,
  });
}
