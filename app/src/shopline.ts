import { shoplineApp } from '@shoplineos/shopline-app-express';
import { SQLiteSessionStorage } from '@shoplineos/shopline-app-session-storage-sqlite';
import 'dotenv/config';
import { resolveShoplineAppConfig } from './lib/shopline-app-config';
import { logger } from './lib/logger';

const DB_PATH = process.env.SHOPLINE_SESSION_DB_PATH || `${process.cwd()}/database.sqlite`;
const appConfig = resolveShoplineAppConfig();

const shopline = shoplineApp({
  appKey: appConfig.appKey,
  appSecret: appConfig.appSecret,
  appUrl: appConfig.appUrl,
  authPathPrefix: '/api/auth',
  scopes: appConfig.scopes,
  sessionStorage: new SQLiteSessionStorage(DB_PATH),
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
