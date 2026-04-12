import express from 'express';
import { join } from 'path';
import shopline from './shopline';
import { readFileSync } from 'fs';
import serveStatic from 'serve-static';
import { webhooksController } from './controller/webhook';
import createProductController from './controller/product/create';
import { initializeBlindBoxPersistence } from './db/client';
import { logger } from './lib/logger';
import { createBlindBoxAdminRouter } from './controller/admin/blind-box';

const PORT = parseInt(process.env.BACKEND_PORT || process.env.PORT, 10);

const STATIC_PATH =
  process.env.NODE_ENV === 'production'
    ? `${process.cwd()}/../web/dist`
    : `${process.cwd()}/../web`;

async function start() {
  await initializeBlindBoxPersistence();

  const app = express();

  app.get(shopline.config.auth.path, shopline.auth.begin());

  app.get(shopline.config.auth.callbackPath, shopline.auth.callback(), shopline.redirectToAppHome());
  app.post('/api/webhooks', express.text({ type: '*/*' }), webhooksController());

  // api path for frontend/vite.config
  app.use('/api/*', express.text({ type: '*/*' }), shopline.validateAuthentication());

  app.get('/api/products/create', createProductController);
  app.use('/api/blind-box', createBlindBoxAdminRouter());

  app.use(express.json());

  app.use(shopline.cspHeaders());
  app.use(serveStatic(STATIC_PATH, { index: false }));

  app.use('/*', shopline.confirmInstallationStatus(), async (_req, res, _next) => {
    return res
      .status(200)
      .set('Content-Type', 'text/html')
      .send(readFileSync(join(STATIC_PATH, 'index.html')));
  });

  app.listen(PORT, () => {
    logger.info('SHOPLINE backend started', {
      port: PORT,
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
