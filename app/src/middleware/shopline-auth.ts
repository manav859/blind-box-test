import { NextFunction, Request, Response } from 'express';
import { Session } from '@shoplineos/shopline-api-js';
import { getPgPool } from '../db/postgres-client';
import { PostgresSessionStorage } from '../db/session/postgres-session-storage';
import { logger } from '../lib/logger';

/** Safe session summary for logging — never includes accessToken or secrets. */
function safeSessionSummary(session: Session) {
  return {
    id: session.id,
    handle: session.handle,
    isOnline: session.isOnline,
    scopes: session.scope,
    expires: session.expires ?? null,
    accessTokenPresent: Boolean(session.accessToken),
  };
}

/**
 * True when the session carries an expiry that is at or before now. A session
 * row existing in the DB is NOT proof the token still works — SHOPLINE rejects
 * expired tokens with 401, so we must check this before trusting the session.
 */
function isSessionExpired(session: Session): boolean {
  if (!session.expires) {
    return false;
  }
  return new Date(session.expires).getTime() <= Date.now();
}

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
      // Prefer a non-expired tokened session; only fall back to an expired one
      // so the expiry guard below can delete it and trigger re-auth.
      const tokened = rows.filter((s) => s.accessToken);
      session = tokened.find((s) => !isSessionExpired(s)) ?? tokened[0];
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

  // A DB row alone does NOT mean the token is still good. If the session has
  // expired, SHOPLINE would reject every API call with 401 and the app would
  // fall back to an empty cache. Delete the dead session and force re-auth.
  if (isSessionExpired(session)) {
    const appUrl = process.env.SHOPLINE_APP_URL ?? '';
    const authUrl = `${appUrl}/auth?handle=${encodeURIComponent(handle)}`;
    logger.warn('requireShoplineSession: session expired — deleting and forcing re-auth', {
      handle,
      sessionId: session.id,
      expires: session.expires ?? null,
    });
    try {
      await sessionStorage.deleteSession(session.id);
    } catch (err) {
      logger.error('requireShoplineSession: failed to delete expired session', {
        handle,
        sessionId: session.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
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

  logger.info('requireShoplineSession: session valid', safeSessionSummary(session));

  next();
}
