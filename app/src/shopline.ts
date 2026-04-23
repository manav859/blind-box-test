import { shoplineApp } from '@shoplineos/shopline-app-express';
import 'dotenv/config';
import { resolveShoplineAppConfig } from './lib/shopline-app-config';
import { logger } from './lib/logger';
import { getPgPool } from './db/postgres-client';
import { PostgresSessionStorage } from './db/session/postgres-session-storage';

const appConfig = resolveShoplineAppConfig();

const sessionStorage = new PostgresSessionStorage(getPgPool());

logger.info('Session storage initializing', {
  mode: 'postgres',
  envVarSet: Boolean(process.env.DATABASE_URL),
});

const shopline = shoplineApp({
  appKey: appConfig.appKey,
  appSecret: appConfig.appSecret,
  appUrl: appConfig.appUrl,
  authPathPrefix: '/api/auth',
  scopes: appConfig.scopes,
  sessionStorage,
  isEmbeddedApp: true,
  webhooks: {
    'apps/installed_uninstalled': {
      callbackUrl: '/api/webhooks',
    },
    'orders/paid': {
      callbackUrl: '/api/webhooks',
    },
  },
  hooks: {
    afterAuth: async ({ session }) => {
      logger.info('OAuth complete — session persisted to Postgres', {
        shop: session.handle,
        sessionId: session.id,
        isOnline: session.isOnline,
      });
      try {
        await shopline.registerWebhooks({ session });
        logger.info('Webhooks registered after install', { shop: session.handle });
      } catch (error) {
        logger.error('Webhook registration failed after install — manual re-install required', {
          shop: session.handle,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  },
});

export default shopline;
