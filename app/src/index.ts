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
import { DEFAULT_BACKEND_PORT, resolveBackendPort } from './lib/backend-port';

const resolvedPort = resolveBackendPort();

const STATIC_PATH =
  process.env.NODE_ENV === 'production'
    ? `${process.cwd()}/../web/dist`
    : `${process.cwd()}/../web`;

async function start() {
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
