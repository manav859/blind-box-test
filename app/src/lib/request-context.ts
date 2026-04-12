import { randomUUID } from 'crypto';
import { IncomingHttpHeaders } from 'http';

export interface RequestContext {
  requestId: string;
  shop?: string;
  topic?: string;
  entityId?: string;
}

function firstHeaderValue(value?: string | string[]): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export function getRequestIdFromHeaders(headers: IncomingHttpHeaders): string {
  return (
    firstHeaderValue(headers['x-request-id']) ||
    firstHeaderValue(headers['traceid']) ||
    firstHeaderValue(headers['x-shopline-request-id']) ||
    randomUUID()
  );
}

export function createRequestContext(context: Partial<RequestContext> = {}): RequestContext {
  return {
    requestId: context.requestId || randomUUID(),
    shop: context.shop,
    topic: context.topic,
    entityId: context.entityId,
  };
}
