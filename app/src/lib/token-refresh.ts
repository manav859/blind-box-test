import { Session } from '@shoplineos/shopline-api-js';
import shopline from '../shopline';
import { logger } from './logger';
import { SessionExpiredError } from './errors';

/**
 * SHOPLINE access tokens expire 10 HOURS after issue. We refresh well before
 * that so neither an admin request nor webhook processing ever hits an expired
 * token. On the request path we refresh ~60 minutes ahead of expiry; the
 * background sweep (index.ts) uses a wider window so stores nobody is actively
 * viewing stay fresh too.
 */
export const TOKEN_REFRESH_LEAD_MS = 60 * 60 * 1000; // 60 minutes

/**
 * True when the session carries an expiry that is within `leadMs` of now (or
 * already in the past). Sessions with no known expiry are treated as not
 * expiring (the SDK omits expires only for tokens it can't date).
 */
export function isTokenExpiringSoon(session: Session, leadMs = TOKEN_REFRESH_LEAD_MS): boolean {
  if (!session.expires) {
    return false;
  }
  return session.expires.getTime() - Date.now() <= leadMs;
}

/**
 * Refresh a shop's offline access token via the SHOPLINE OAuth refresh endpoint
 * and persist the new token + expiry, returning the refreshed Session.
 *
 * We delegate to the SDK's `api.auth.refreshToken` rather than hand-rolling the
 * HMAC for two reasons:
 *
 *  1. Correct signing. The SHOPLINE refresh endpoint signs
 *     `HMAC-SHA256(appSecret, timestamp)` — the TIMESTAMP ONLY, hex-encoded.
 *     (NOT `appKey + timestamp`; that form is used by token/create, not
 *     token/refresh.) The SDK gets this right; a hand-rolled `appkey+timestamp`
 *     sign is rejected by SHOPLINE.
 *  2. Canonical session. The SDK parses `expireTime`, sets scope, and rebuilds
 *     the offline Session with the `offline_<handle>` id that storeSession /
 *     loadSession already key on — so the refreshed row replaces the old one.
 *
 * Throws SessionExpiredError when SHOPLINE refuses the refresh (e.g. the app
 * was uninstalled / STORE_NOT_INSTALL_APP) or the new token can't be stored, so
 * callers can fall back to a full re-auth redirect.
 */
export async function refreshShoplineToken(shop: string): Promise<Session> {
  let session: Session;
  try {
    ({ session } = await shopline.api.auth.refreshToken({ handle: shop }));
  } catch (error) {
    logger.warn('SHOPLINE token refresh failed', {
      shop,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new SessionExpiredError(
      'Session expired — SHOPLINE refused to refresh the access token. Please re-authenticate.',
    );
  }

  try {
    await shopline.config.sessionStorage.storeSession(session);
  } catch (error) {
    logger.error('Failed to persist refreshed SHOPLINE session', {
      shop,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new SessionExpiredError('Refreshed token could not be stored. Please re-authenticate.');
  }

  logger.info('SHOPLINE access token refreshed', {
    shop,
    sessionId: session.id,
    expires: session.expires ?? null,
  });

  return session;
}
