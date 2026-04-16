import { shoplineApp } from '@shoplineos/shopline-app-express';
import { SQLiteSessionStorage } from '@shoplineos/shopline-app-session-storage-sqlite';
import 'dotenv/config';
import { resolveShoplineAppConfig } from './lib/shopline-app-config';

const DB_PATH = `${process.cwd()}/database.sqlite`;
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
      shopline.registerWebhooks({ session });
    },
  },
});

export default shopline;
