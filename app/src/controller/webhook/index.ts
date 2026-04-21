import { RequestHandler } from 'express';
import shopline from '../../shopline';
import { getWebhookEventService } from '../../service/webhook/webhook-event-service';
import { getPaidOrderWebhookService } from '../../service/webhook/paid-order-webhook-service';
import { createRequestContext, getRequestIdFromHeaders } from '../../lib/request-context';
import { logger } from '../../lib/logger';
import { toAppError } from '../../lib/errors';
import { OrderPaidWebhookPayload } from '../../domain/blind-box/order-paid';

function getShopFromWebhookHeaders(headers): string {
  const shopDomainHeader = headers['x-shopline-shop-domain'];
  const shopDomain = Array.isArray(shopDomainHeader) ? shopDomainHeader[0] : shopDomainHeader;

  if (!shopDomain || typeof shopDomain !== 'string') {
    return '';
  }

  return shopDomain.replace(/\.myshopline\.com$/i, '');
}

export const webhooksController: () => RequestHandler = () => async (_req, res) => {
  const requestId = getRequestIdFromHeaders(_req.headers);

  try {
    const data = await shopline.webhookAuthentication(_req);
    const { topic, session, payload } = data;
    const shop = session?.handle || getShopFromWebhookHeaders(_req.headers);

    if (!shop) {
      logger.warn('Webhook rejected: could not resolve shop from session or headers', { requestId, topic });
      res.status(400).send({ success: false, error: { code: 'MISSING_SHOP', message: 'Could not resolve shop identity from this request' } });
      return;
    }

    const webhookEventService = await getWebhookEventService();
    const explicitWebhookId =
      (_req.headers['x-shopline-webhook-id'] as string | undefined) ||
      (_req.headers['x-shopline-event-id'] as string | undefined);

    if (!explicitWebhookId) {
      logger.warn('Webhook received without explicit x-shopline-webhook-id — using payload fingerprint for deduplication', { requestId, shop, topic });
    }

    const eventId = webhookEventService.buildEventId(_req.headers, shop, topic, payload);

    logger.info('Received verified webhook event', {
      ...createRequestContext({
        requestId,
        shop,
        topic,
      }),
      eventId,
    });

    switch (topic) {
      case 'apps/installed_uninstalled':
        await webhookEventService.recordReceivedEvent({
          shop,
          topic,
          eventId,
          payload: JSON.stringify(payload || {}),
        });
        if (session) {
          await shopline.config.sessionStorage.deleteSession(session.id);
        }
        await webhookEventService.markProcessed(shop, eventId);
        break;
      case 'orders/paid': {
        const paidOrderWebhookService = await getPaidOrderWebhookService();
        const result = await paidOrderWebhookService.processPaidOrderWebhook(
          _req.headers,
          payload as unknown as OrderPaidWebhookPayload,
        );

        res.status(result.shouldAcknowledge ? 200 : 500).send({
          success: result.shouldAcknowledge,
          data: {
            topic,
            eventId: result.eventId,
            status: result.status,
            summary: result.summary,
          },
        });
        return;
      }
      case 'products/create':
        await webhookEventService.recordReceivedEvent({
          shop,
          topic,
          eventId,
          payload: JSON.stringify(payload || {}),
        });
        await webhookEventService.markIgnored(shop, eventId);
        break;
      case 'customers/redact':
        await webhookEventService.recordReceivedEvent({
          shop,
          topic,
          eventId,
          payload: JSON.stringify(payload || {}),
        });
        await webhookEventService.markIgnored(shop, eventId);
        break;
      case 'merchants/redact':
        await webhookEventService.recordReceivedEvent({
          shop,
          topic,
          eventId,
          payload: JSON.stringify(payload || {}),
        });
        await webhookEventService.markIgnored(shop, eventId);
        break;
      default:
        await webhookEventService.recordReceivedEvent({
          shop,
          topic,
          eventId,
          payload: JSON.stringify(payload || {}),
        });
        await webhookEventService.markFailed(shop, eventId, `Unhandled webhook topic: ${topic}`);
        res.status(404).send({
          success: false,
          error: {
            code: 'UNHANDLED_WEBHOOK_TOPIC',
            message: 'Unhandled webhook topic',
          },
        });
        return;
    }

    res.status(200).send({
      success: true,
      data: {
        topic,
        eventId,
      },
    });
  } catch (error) {
    const appError = toAppError(error);
    logger.error('Webhook processing failed', {
      ...createRequestContext({
        requestId,
      }),
      code: appError.code,
      details: appError.details,
    });

    res.status(appError.statusCode).send({
      success: false,
      error: {
        code: appError.code,
        message: appError.expose ? appError.message : 'Internal server error',
      },
    });
  }
};
