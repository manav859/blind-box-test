import { shoplineApp } from '@shoplineos/shopline-app-express';
import { SQLiteSessionStorage } from '@shoplineos/shopline-app-session-storage-sqlite';
import 'dotenv/config';
import { resolveShoplineAppConfig } from './lib/shopline-app-config';
import { logger } from './lib/logger';

export const SESSION_DB_PATH = process.env.SHOPLINE_SESSION_DB_PATH || `${process.cwd()}/database.sqlite`;

const appConfig = resolveShoplineAppConfig();

logger.info('Session storage initializing', {
  sessionDbPath: SESSION_DB_PATH,
  envVarSet: Boolean(process.env.SHOPLINE_SESSION_DB_PATH),
  persistent: SESSION_DB_PATH.startsWith('/var/data'),
});

const shopline = shoplineApp({
  appKey: appConfig.appKey,
  appSecret: appConfig.appSecret,
  appUrl: appConfig.appUrl,
  authPathPrefix: '/api/auth',
  scopes: appConfig.scopes,
  sessionStorage: new SQLiteSessionStorage(SESSION_DB_PATH),
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
      logger.info('OAuth complete — session persisted', {
        shop: session.handle,
        sessionId: session.id,
        sessionDbPath: SESSION_DB_PATH,
        persistent: SESSION_DB_PATH.startsWith('/var/data'),
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
