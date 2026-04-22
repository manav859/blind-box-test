import { shoplineApp } from '@shoplineos/shopline-app-express';
import { SQLiteSessionStorage } from '@shoplineos/shopline-app-session-storage-sqlite';
import 'dotenv/config';
import { existsSync, accessSync, mkdirSync, constants } from 'fs';
import { dirname } from 'path';
import { resolveShoplineAppConfig } from './lib/shopline-app-config';
import { logger } from './lib/logger';

export const SESSION_DB_PATH = process.env.SHOPLINE_SESSION_DB_PATH || `${process.cwd()}/database.sqlite`;

// Ensures the parent directory of the session DB exists and is writable before
// SQLiteSessionStorage opens the sqlite3 Database object. The sqlite3 package does
// NOT create missing parent directories — it emits SQLITE_CANTOPEN as an unhandled
// error event, crashing the process. Must run synchronously before SQLiteSessionStorage().
function ensureSessionDbDirectory(dbPath: string): void {
  const parentDir = dirname(dbPath);
  const isProduction = process.env.NODE_ENV === 'production';
  const parentExists = existsSync(parentDir);
  const fileExists = parentExists && existsSync(dbPath);

  logger.info('Session DB pre-open check', {
    sessionDbPath: dbPath,
    parentDir,
    parentExists,
    fileExists,
    isProduction,
    envVarSet: Boolean(process.env.SHOPLINE_SESSION_DB_PATH),
  });

  if (!parentExists) {
    if (isProduction) {
      // In production the parent directory must already exist — it is the Render
      // persistent disk mount point (/var/data). Creating it with mkdirSync would
      // silently produce an ephemeral directory that is lost on every restart.
      // Fail loudly so the operator knows to fix the disk configuration.
      const msg =
        `FATAL: Session DB parent directory does not exist: ${parentDir}\n` +
        `Session DB path: ${dbPath}\n` +
        `This directory is the Render persistent disk mount point.\n` +
        `Required fix:\n` +
        `  1. Upgrade the Render service to a paid plan (free plan does not support persistent disks)\n` +
        `  2. In the Render dashboard → blindbox-backend → Disks → Add disk:\n` +
        `       Name: blindbox-data\n` +
        `       Mount Path: ${parentDir}\n` +
        `       Size: 1 GB\n` +
        `  3. Redeploy — /var/data will then exist and SQLite can create sessions.sqlite inside it\n` +
        `Do NOT change SHOPLINE_SESSION_DB_PATH to an ephemeral path; sessions would be lost on every restart.`;
      logger.error('Session DB directory missing — persistent disk not mounted', {
        parentDir,
        sessionDbPath: dbPath,
      });
      throw new Error(msg);
    }

    // Development: create any required directories so local startup works without manual setup.
    mkdirSync(parentDir, { recursive: true });
    logger.info('Session DB directory created (development)', { parentDir });
    return;
  }

  // Directory exists — confirm it is writable before handing the path to SQLite.
  try {
    accessSync(parentDir, constants.W_OK);
  } catch {
    const msg = `FATAL: Session DB directory exists but is not writable: ${parentDir}`;
    logger.error(msg, { sessionDbPath: dbPath });
    throw new Error(msg);
  }

  logger.info('Session DB directory ready', {
    parentDir,
    writable: true,
    fileExists,
  });
}

const appConfig = resolveShoplineAppConfig();

ensureSessionDbDirectory(SESSION_DB_PATH);

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
