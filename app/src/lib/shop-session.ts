import { Response } from 'express';
import { UnauthorizedError } from './errors';

export interface ShopSessionContext {
  shop: string;
  accessToken?: string;
}

export function requireShopSession(res: Response): ShopSessionContext {
  const session = res.locals?.shopline?.session;
  if (!session?.handle) {
    throw new UnauthorizedError('Missing SHOPLINE session context');
  }

  return {
    shop: session.handle,
    accessToken: session.accessToken,
  };
}
