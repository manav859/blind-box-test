export interface AppErrorOptions {
  code: string;
  statusCode: number;
  message: string;
  details?: unknown;
  expose?: boolean;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;
  public readonly expose: boolean;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = 'AppError';
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.details = options.details;
    this.expose = options.expose ?? options.statusCode < 500;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message,
      details,
    });
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details?: unknown) {
    super({
      code: 'NOT_FOUND',
      statusCode: 404,
      message,
      details,
    });
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super({
      code: 'CONFLICT',
      statusCode: 409,
      message,
      details,
    });
    this.name = 'ConflictError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', details?: unknown) {
    super({
      code: 'UNAUTHORIZED',
      statusCode: 401,
      message,
      details,
    });
    this.name = 'UnauthorizedError';
  }
}

/**
 * Raised when SHOPLINE rejects the stored access token (HTTP 401 /
 * "ACCESS_TOKEN is expired"). Distinct from a generic 401 so callers can choose
 * to surface a re-auth redirect instead of silently degrading (e.g. the
 * discovery service must NOT fall back to local cache on this). The message
 * intentionally contains "Session expired" so the frontend banner detects it.
 */
export class SessionExpiredError extends AppError {
  constructor(message = 'Session expired — please re-authenticate', details?: unknown) {
    super({
      code: 'SESSION_EXPIRED',
      statusCode: 401,
      message,
      details,
    });
    this.name = 'SessionExpiredError';
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError({
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      message: error.message,
      details: {
        name: error.name,
      },
      expose: false,
    });
  }

  return new AppError({
    code: 'INTERNAL_ERROR',
    statusCode: 500,
    message: 'An unexpected error occurred',
    details: error,
    expose: false,
  });
}
