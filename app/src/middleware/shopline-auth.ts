import { NextFunction, Request, Response } from 'express';
import { Session } from '@shoplineos/shopline-api-js';
import { getPgPool } from '../db/postgres-client';
import { PostgresSessionStorage } from '../db/session/postgres-session-storage';
import { logger } from '../lib/logger';

// Shared session storage — same pool used by the rest of the app.
const sessionStorage = new PostgresSessionStorage(getPgPool());

/**
 * Offline-session authentication middleware.
 *
 * Replaces shopline.validateAuthentication() for all protected API routes.
 *
 * Why: validateAuthentication() requires an `Authorization: Bearer <jwt>` header
 * produced by App Bridge. In practice App Bridge fails to initialise in some
 * SHOPLINE Admin builds ("Invalid Action Type"), so the header is never sent and
 * every request gets a redirect-to-auth response → "Session expired" banner.
 *
 * We use offline tokens (useOnlineTokens: false). The offline session ID is
 * always `offline_<handle>` — no JWT needed. The handle is already normalised
 * onto req.query.handle by the global resolveHandle() middleware in index.ts.
 *
 * On success:  res.locals.shopline.session is populated (same shape as the
 *              library sets) and next() is called.
 * On failure:  401 JSON { error, authUrl } so the frontend can show a targeted
 *              "Re-authenticate" button instead of a generic error.
 */
export async function requireShoplineSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const handle = req.query.handle as string | undefined;
  const authHeaderPresent = Boolean(req.headers.authorization);

  logger.info('requireShoplineSession', {
    path: req.path,
    handle: handle ?? '(none)',
    authHeaderPresent,
  });

  if (!handle) {
    logger.warn('requireShoplineSession: no handle — cannot load session', { path: req.path });
    res.status(401).json({
      error: 'Session expired — shop handle missing from request',
      authUrl: `${process.env.SHOPLINE_APP_URL ?? ''}/auth?handle=testlive`,
    });
    return;
  }

  // Offline session ID is deterministic — no JWT needed.
  const offlineSessionId = `offline_${handle}`;

  let session: Session | undefined;

  // Primary: load by the well-known offline ID.
  try {
    session = await sessionStorage.loadSession(offlineSessionId);
    logger.debug('requireShoplineSession: loadSession result', {
      handle,
      sessionId: offlineSessionId,
      found: Boolean(session),
      hasAccessToken: Boolean(session?.accessToken),
    });
  } catch (err) {
    logger.error('requireShoplineSession: loadSession threw', {
      handle,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Fallback: any session row stored under this handle (handles ID format drift).
  if (!session) {
    try {
      const rows = await sessionStorage.findSessionsByHandle(handle);
      session = rows.find((s) => s.accessToken);
      if (session) {
        logger.debug('requireShoplineSession: found session via findSessionsByHandle fallback', {
          handle,
          sessionId: session.id,
        });
      }
    } catch (err) {
      logger.error('requireShoplineSession: findSessionsByHandle threw', {
        handle,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!session || !session.accessToken) {
    const appUrl = process.env.SHOPLINE_APP_URL ?? '';
    const authUrl = `${appUrl}/auth?handle=${encodeURIComponent(handle)}`;
    logger.warn('requireShoplineSession: no valid session — returning 401', {
      handle,
      sessionFound: Boolean(session),
      authUrl,
    });
    res.status(401).json({
      error: 'Session expired — please re-authenticate',
      authUrl,
    });
    return;
  }

  // Attach session exactly as validateAuthentication() does so downstream
  // route handlers can read res.locals.shopline.session.
  res.locals.shopline = {
    ...(res.locals.shopline ?? {}),
    session,
  };

  logger.info('requireShoplineSession: session valid', {
    handle,
    sessionId: session.id,
    scopes: session.scope,
  });

  next();
}
