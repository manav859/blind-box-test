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

  res.status(appError.statusCode).send({
    success: false,
    error: {
      code: appError.code,
      message: appError.expose ? appError.message : 'Internal server error',
    },
  });
}
