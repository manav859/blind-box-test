import { Response } from 'express';
import { logger } from './logger';
import { toAppError } from './errors';
import { RequestContext } from './request-context';

export function parseJsonBody<T>(body: unknown): T {
  if (body === undefined || body === null || body === '') {
    return {} as T;
  }

  if (typeof body === 'string') {
    return JSON.parse(body) as T;
  }

  return body as T;
}

export function sendErrorResponse(res: Response, error: unknown, context: RequestContext): void {
  const appError = toAppError(error);

  logger.error(appError.message, {
    ...context,
    code: appError.code,
    details: appError.details,
  });

  // For auth failures hit mid-request (e.g. SHOPLINE rejected an expired token),
  // mirror the requireShoplineSession 401 contract: a string `error` plus an
  // `authUrl`, so the frontend shows the "Re-authenticate" flow instead of a
  // silently-empty view. (The frontend reads `body.error` as a string.)
  if (appError.statusCode === 401) {
    const appUrl = process.env.SHOPLINE_APP_URL ?? '';
    const authUrl = context.shop
      ? `${appUrl}/auth?handle=${encodeURIComponent(context.shop)}`
      : `${appUrl}/auth`;
    res.status(401).send({
      success: false,
      error: appError.message,
      code: appError.code,
      authUrl,
    });
    return;
  }

  res.status(appError.statusCode).send({
    success: false,
    error: {
      code: appError.code,
      message: appError.expose ? appError.message : 'Internal server error',
    },
  });
}
