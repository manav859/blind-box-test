import { Session } from '@shoplineos/shopline-api-js';
import shopline from '../shopline';
import { NotFoundError } from './errors';
import { logger } from './logger';
import { refreshShoplineToken } from './token-refresh';

interface SessionStorageWithHandleLookup {
  findSessionsByHandle(handle: string): Promise<Session[]>;
}

export interface ShopAdminAccessTokenProvider {
  getAccessToken(shop: string): Promise<string>;
}

function isSessionUsable(session: Session): boolean {
  if (!session.accessToken) {
    return false;
  }

  if (!session.expires) {
    return true;
  }

  return session.expires.getTime() > Date.now();
}

function compareSessionPriority(left: Session, right: Session): number {
  if (left.isOnline === right.isOnline) {
    const leftExpires = left.expires?.getTime() || Number.MAX_SAFE_INTEGER;
    const rightExpires = right.expires?.getTime() || Number.MAX_SAFE_INTEGER;
    return rightExpires - leftExpires;
  }

  return Number(left.isOnline) - Number(right.isOnline);
}

export class ShoplineSessionAccessTokenProvider implements ShopAdminAccessTokenProvider {
  async getAccessToken(shop: string): Promise<string> {
    const sessionStorage = shopline.config.sessionStorage as unknown as SessionStorageWithHandleLookup;
    if (typeof sessionStorage.findSessionsByHandle !== 'function') {
      throw new NotFoundError('SHOPLINE session storage does not support handle lookup for inventory execution');
    }

    const sessions = await sessionStorage.findSessionsByHandle(shop);
    const usableSession = sessions
      .filter(isSessionUsable)
      .sort(compareSessionPriority)[0];

    if (!usableSession?.accessToken) {
      // No live token, but if there's an expired token row the app is still
      // installed — refresh on demand. This path is hit by webhook and other
      // background flows that never pass through the request-time auth
      // middleware, so it's their only chance to recover a dead 10h token.
      const hasStoredToken = sessions.some((session) => session.accessToken);
      if (hasStoredToken) {
        try {
          const refreshed = await refreshShoplineToken(shop);
          if (refreshed.accessToken) {
            return refreshed.accessToken;
          }
        } catch (error) {
          logger.warn('On-demand token refresh failed for shop', {
            shop,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      throw new NotFoundError(`No stored SHOPLINE admin access token is available for shop "${shop}"`);
    }

    return usableSession.accessToken;
  }
}
