import express, { NextFunction, Request, Response } from 'express';
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
import { requireShoplineSession } from './middleware/shopline-auth';

const resolvedPort = resolveBackendPort();

const STATIC_PATH =
  process.env.NODE_ENV === 'production'
    ? `${process.cwd()}/../web/dist`
    : `${process.cwd()}/../web`;

function validateStartupConfig(): void {
  const cfg = getRuntimeConfig();

  const isExecuteMode = cfg.blindBoxInventoryExecutionMode === 'execute';
  const dbHost = (() => { try { return new URL(cfg.databaseUrl).hostname; } catch { return '(unparseable)'; } })();

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
    databaseMode: 'postgres',
    databaseHost: dbHost,
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

// ── Robust handle resolver ──────────────────────────────────────────────────
// @shoplineos/shopline-app-express reads req.query.handle everywhere
// (validateAuthentication, confirmInstallationStatus, redirectToAuth).
// SHOPLINE Admin may inject the shop as ?shop=, ?handle=, or ?store=.
// SHOPLINE_DEFAULT_HANDLE provides a dev fallback so the server can find a
// session even when the Admin doesn't inject the param (e.g. direct access).
function resolveHandle(req: Request): { handle: string; source: string } {
  const q = req.query as Record<string, unknown>;
  if (typeof q.handle === 'string' && q.handle) return { handle: q.handle, source: 'query.handle' };
  if (typeof q.shop   === 'string' && q.shop)   return { handle: q.shop,   source: 'query.shop' };
  if (typeof q.store  === 'string' && q.store)  return { handle: q.store,  source: 'query.store' };
  const envHandle = process.env.SHOPLINE_DEFAULT_HANDLE;
  if (envHandle) return { handle: envHandle, source: 'env.SHOPLINE_DEFAULT_HANDLE' };
  return { handle: '', source: 'none' };
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

  // Resolve shop handle from all known sources and normalise to req.query.handle
  // before any library middleware sees the request.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const { handle, source } = resolveHandle(req);
    if (handle) {
      (req.query as Record<string, unknown>).handle = handle;
      if (source !== 'query.handle') {
        logger.debug('Handle resolved from alternate source', { path: req.path, handle, source });
      }
    } else {
      logger.warn('No shop handle in request — will serve shell without session check', {
        path: req.path,
      });
    }
    next();
  });

  // ── Public legal pages (no auth required) ───────────────────────────────
  app.get('/privacy-policy', (_req, res) => {
    res.status(200).set('Content-Type', 'text/html; charset=utf-8').send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Privacy Policy - Blind Box</title>
<style>body{font-family:system-ui,sans-serif;max-width:700px;margin:48px auto;padding:0 24px;color:#222;line-height:1.7}h1{font-size:1.8rem;margin-bottom:.25rem}p.meta{color:#666;font-size:.9rem;margin-top:0}h2{margin-top:2rem;font-size:1.1rem}</style>
</head>
<body>
<h1>Privacy Policy</h1>
<p class="meta">Blind Box &mdash; Last updated: 2026-04-30</p>

<p>Blind Box respects merchant and customer privacy. The app only collects store, product, collection, order, and line item data needed to detect blind box products, assign rewards, and record order results. We do not sell data or collect payment card details. Data is used only to provide, secure, and improve the app. Merchants may request data access or deletion by contacting support.</p>

<h2>Data Collected</h2>
<p>We access store information, product and collection details, and paid order data (order ID, line items, product IDs) solely to operate the blind-box reward assignment feature.</p>

<h2>Data Sharing</h2>
<p>We do not sell, rent, or share merchant or customer data with third parties except as required to operate the service (e.g. database hosting).</p>

<h2>Data Retention</h2>
<p>Order assignment records are retained to support order history and retry flows. Merchants may request deletion of their store data at any time.</p>

<h2>Contact</h2>
<p>For data access or deletion requests, contact: <a href="mailto:support@example.com">support@example.com</a></p>
</body>
</html>`);
  });

  app.get('/terms-of-service', (_req, res) => {
    res.status(200).set('Content-Type', 'text/html; charset=utf-8').send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Terms of Service - Blind Box</title>
<style>body{font-family:system-ui,sans-serif;max-width:700px;margin:48px auto;padding:0 24px;color:#222;line-height:1.7}h1{font-size:1.8rem;margin-bottom:.25rem}p.meta{color:#666;font-size:.9rem;margin-top:0}h2{margin-top:2rem;font-size:1.1rem}</style>
</head>
<body>
<h1>Terms of Service</h1>
<p class="meta">Blind Box &mdash; Last updated: 2026-04-30</p>

<p>Blind Box is provided to help SHOPLINE merchants sell blind box products and assign rewards after paid orders. Merchants are responsible for configuring products, collections, fulfillment, customer communication, and compliance with applicable laws. The app is provided as is, and availability may depend on SHOPLINE APIs, hosting, and merchant store settings.</p>

<h2>Use of the Service</h2>
<p>By installing Blind Box you agree to use it only for lawful purposes and in accordance with SHOPLINE's merchant terms. You are responsible for the products and collections you configure.</p>

<h2>Limitation of Liability</h2>
<p>The app is provided "as is" without warranty of any kind. We are not liable for missed reward assignments caused by SHOPLINE API unavailability, inventory discrepancies, or misconfigured products.</p>

<h2>Changes</h2>
<p>We may update these terms at any time. Continued use of the app after changes constitutes acceptance.</p>

<h2>Contact</h2>
<p><a href="mailto:support@example.com">support@example.com</a></p>
</body>
</html>`);
  });

  app.get('/api/health', (_req, res) => {
    const cfg = getRuntimeConfig();
    const dbHost = (() => { try { return new URL(cfg.databaseUrl).hostname; } catch { return '(unparseable)'; } })();
    res.status(200).json({
      status: 'ok',
      appKey: process.env.SHOPLINE_APP_KEY ? process.env.SHOPLINE_APP_KEY.slice(0, 8) + '...' : 'missing',
      appUrl: process.env.SHOPLINE_APP_URL || 'missing',
      executionMode: process.env.BLIND_BOX_INVENTORY_EXECUTION_MODE || 'missing',
      locationId: process.env.BLIND_BOX_SHOPLINE_LOCATION_ID ? 'set' : 'missing',
      databaseMode: 'postgres',
      databaseHost: dbHost,
      sessionMode: 'postgres',
    });
  });

  app.get(shopline.config.auth.path, shopline.auth.begin());

  app.get(shopline.config.auth.callbackPath, shopline.auth.callback(), shopline.redirectToAppHome());
  app.post('/api/webhooks', express.text({ type: '*/*' }), webhooksController());

  // Blind-box admin API — requires authenticated SHOPLINE session.
  // Uses offline-session lookup by handle instead of validateAuthentication()
  // which requires an App Bridge JWT that is unavailable in some SHOPLINE builds.
  app.use(
    '/api/blind-box',
    requireShoplineSession,
    express.json(),
    createBlindBoxAdminRouter()
  );

  // Blind-box storefront API — public, no auth required
  app.use('/api/storefront/blind-box', createBlindBoxStorefrontRouter());

  // After OAuth, the library redirects to /exit-iframe?redirectUri=<url>.
  // This handler breaks out of the embedded iframe by navigating window.top.
  app.get('/exit-iframe', (req: Request, res: Response) => {
    const redirectUri = req.query.redirectUri as string | undefined;
    const safe = redirectUri && /^https?:\/\//.test(redirectUri) ? redirectUri : '/';
    res
      .status(200)
      .set('Content-Type', 'text/html')
      .send(
        `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>` +
        `if(window.top===window){window.location.replace(${JSON.stringify(safe)});}` +
        `else{window.top.location.replace(${JSON.stringify(safe)});}` +
        `</script></body></html>`,
      );
  });

  app.use(shopline.cspHeaders());
  app.use(serveStatic(STATIC_PATH, { index: false }));

  // If handle is present: let confirmInstallationStatus check the session.
  //   - Valid session  → passes to next (serves React shell)
  //   - No session     → library redirects to /auth?handle=<handle> (starts OAuth)
  // If handle is absent (direct browser access with no params): skip the session
  //   check and serve the React shell; the frontend shows an auth link.
  const checkInstall = shopline.confirmInstallationStatus();
  app.use(
    '/*',
    (req: Request, res: Response, next: NextFunction) => {
      if ((req.query as Record<string, unknown>).handle) {
        checkInstall(req, res, next);
      } else {
        next();
      }
    },
    async (_req, res) => {
      return res
        .status(200)
        .set('Content-Type', 'text/html')
        .send(readFileSync(join(STATIC_PATH, 'index.html')));
    },
  );

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
