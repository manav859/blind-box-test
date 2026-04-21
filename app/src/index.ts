import express from 'express';
import { join } from 'path';
import shopline from './shopline';
import { readFileSync } from 'fs';
import serveStatic from 'serve-static';
import { webhooksController } from './controller/webhook';
// Blind-box storefront API controller (product status for theme extension block)
import { createBlindBoxStorefrontRouter } from './controller/storefront/blind-box';
// Blind-box admin API controller (pool CRUD, assignment queries, debug endpoints)
import { createBlindBoxAdminRouter } from './controller/admin/blind-box';
import { initializeBlindBoxPersistence } from './db/client';
import { logger } from './lib/logger';
import { getRuntimeConfig } from './lib/config';
import { DEFAULT_BACKEND_PORT, resolveBackendPort } from './lib/backend-port';

const resolvedPort = resolveBackendPort();

const STATIC_PATH =
  process.env.NODE_ENV === 'production'
    ? `${process.cwd()}/../web/dist`
    : `${process.cwd()}/../web`;

function validateStartupConfig(): void {
  const cfg = getRuntimeConfig();

  const sessionDbPath = process.env.SHOPLINE_SESSION_DB_PATH || `${process.cwd()}/database.sqlite`;
  const isExecuteMode = cfg.blindBoxInventoryExecutionMode === 'execute';

  const requiredScopes = ['read_products', 'read_inventory', 'read_location', 'write_inventory', 'read_orders'];
  const missingScopes = requiredScopes.filter((s) => !cfg.shoplineConfiguredScopes.includes(s));

  logger.info('Blind-box backend ready', {
    environment: process.env.NODE_ENV || 'development',
    executionMode: cfg.blindBoxInventoryExecutionMode,
    inventoryLive: isExecuteMode,
    locationId: cfg.blindBoxShoplineLocationId ?? '(not set)',
    backendUrl: process.env.SHOPLINE_APP_URL ?? '(not set)',
    adminApiVersion: cfg.shoplineAdminApiVersion,
    configuredScopes: cfg.shoplineConfiguredScopes,
    missingScopes: missingScopes.length ? missingScopes : 'none',
    blindBoxDatabasePath: cfg.blindBoxDatabasePath,
    sessionDatabasePath: sessionDbPath,
    logLevel: cfg.logLevel,
  });

  if (!isExecuteMode) {
    logger.warn(
      'DEFERRED MODE — assignments will be created but SHOPLINE inventory will NOT be decremented. ' +
      'Set BLIND_BOX_INVENTORY_EXECUTION_MODE=execute for production.',
    );
  }

  if (!process.env.SHOPLINE_APP_SECRET) {
    throw new Error('SHOPLINE_APP_SECRET is required. Set it in Render env vars from the SHOPLINE Partner Dashboard.');
  }

  if (!process.env.SHOPLINE_APP_URL && !process.env.SHOPLINE_APP_KEY) {
    logger.warn('SHOPLINE_APP_URL or SHOPLINE_APP_KEY not set — app may fail to initialize');
  }

  if (missingScopes.length > 0) {
    logger.warn('SCOPES env is missing required blind-box scopes — inventory execution may fail', { missingScopes });
  }
}

async function start() {
  validateStartupConfig();
  await initializeBlindBoxPersistence();

  if (resolvedPort.invalidSources.length > 0) {
    logger.warn('Ignoring invalid backend port env values', {
      invalidSources: resolvedPort.invalidSources,
      resolvedPort: resolvedPort.port,
      resolvedFrom: resolvedPort.source,
    });
  } else if (resolvedPort.source === 'default') {
    logger.info('Using default backend port for standalone startup', {
      port: DEFAULT_BACKEND_PORT,
    });
  }

  const app = express();

  app.get(shopline.config.auth.path, shopline.auth.begin());

  app.get(shopline.config.auth.callbackPath, shopline.auth.callback(), shopline.redirectToAppHome());
  app.post('/api/webhooks', express.text({ type: '*/*' }), webhooksController());

  // Blind-box admin API — requires authenticated SHOPLINE session
  app.use(
    '/api/blind-box',
    shopline.validateAuthentication(),
    express.json(),
    createBlindBoxAdminRouter()
  );

  // Blind-box storefront API — public, no auth required
  app.use('/api/storefront/blind-box', createBlindBoxStorefrontRouter());

  app.use(shopline.cspHeaders());
  app.use(serveStatic(STATIC_PATH, { index: false }));

  app.use('/*', shopline.confirmInstallationStatus(), async (_req, res, _next) => {
    return res
      .status(200)
      .set('Content-Type', 'text/html')
      .send(readFileSync(join(STATIC_PATH, 'index.html')));
  });

  app.listen(resolvedPort.port, '0.0.0.0', () => {
    logger.info('SHOPLINE backend started', {
      port: resolvedPort.port,
      portSource: resolvedPort.source,
      staticPath: STATIC_PATH,
    });
  });
}

start().catch((error) => {
  logger.error('Failed to start SHOPLINE backend', {
    message: error instanceof Error ? error.message : 'Unknown startup error',
  });
  process.exit(1);
});
