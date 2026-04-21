/**
 * End-to-end smoke test for the SHOPLINE Blind Box backend.
 *
 * Validates:
 *   1. Webhook dispatch + HMAC signing
 *   2. Assignment created in backend
 *   3. Idempotency: replay returns duplicate
 *   4. (execute mode only) SHOPLINE inventory decremented
 *
 * Required env vars:
 *   BACKEND_URL            — https://blind-box-test.onrender.com
 *   SHOPLINE_APP_SECRET    — app secret (used to sign the webhook)
 *   SMOKE_SHOP             — shop handle, e.g. "test-store-mnv"
 *   SMOKE_PRODUCT_ID       — SHOPLINE product ID tagged as blind-box
 *   SMOKE_VARIANT_ID       — (optional) variant ID of a reward product to check inventory
 *   SHOPLINE_ACCESS_TOKEN  — (optional) admin access token for inventory read-back
 *   SMOKE_ORDER_ID         — (optional) unique order ID; defaults to timestamp
 */

import { createHmac } from 'crypto';
import fetch from 'node-fetch';

const BACKEND_URL = (process.env.BACKEND_URL || 'http://localhost:3000').replace(/\/$/, '');
const APP_SECRET = process.env.SHOPLINE_APP_SECRET || '';
const SHOP = process.env.SMOKE_SHOP || '';
const PRODUCT_ID = process.env.SMOKE_PRODUCT_ID || '';
const VARIANT_ID = process.env.SMOKE_VARIANT_ID || null;
const ACCESS_TOKEN = process.env.SHOPLINE_ACCESS_TOKEN || null;
const ORDER_ID = process.env.SMOKE_ORDER_ID || `smoke-${Date.now()}`;
const WEBHOOK_ID = `smoke-${Date.now()}`;

let passed = 0;
let failed = 0;

function pass(label: string) {
  console.log(`  ✓ ${label}`);
  passed++;
}

function fail(label: string, detail?: string) {
  console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  failed++;
}

function buildOrderPayload(orderId: string, productId: string) {
  return {
    id: orderId,
    order_number: `SMOKE-${orderId}`,
    financial_status: 'paid',
    line_items: [
      {
        id: `line-${orderId}-1`,
        product_id: productId,
        variant_id: null,
        quantity: 1,
        title: 'Smoke Test Blind Box',
        sku: null,
      },
    ],
  };
}

function signPayload(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

async function preflight() {
  console.log('\n── PREFLIGHT ──────────────────────────');

  if (!APP_SECRET) {
    fail('SHOPLINE_APP_SECRET set');
    process.exit(1);
  }
  pass('SHOPLINE_APP_SECRET set');

  if (!SHOP) {
    fail('SMOKE_SHOP set');
    process.exit(1);
  }
  pass(`SMOKE_SHOP = ${SHOP}`);

  if (!PRODUCT_ID) {
    fail('SMOKE_PRODUCT_ID set');
    process.exit(1);
  }
  pass(`SMOKE_PRODUCT_ID = ${PRODUCT_ID}`);

  // Check backend health
  try {
    const health = await fetch(`${BACKEND_URL}/api/auth`, { method: 'GET' });
    if (health.status < 500) {
      pass(`Backend reachable at ${BACKEND_URL}`);
    } else {
      fail('Backend health check', `status ${health.status}`);
    }
  } catch (err) {
    fail('Backend reachable', String(err));
    process.exit(1);
  }

  // Check execution mode via response header or body hint
  if (!ACCESS_TOKEN) {
    console.log('  ⚠  SHOPLINE_ACCESS_TOKEN not set — inventory read-back will be skipped');
  }
  if (!VARIANT_ID) {
    console.log('  ⚠  SMOKE_VARIANT_ID not set — inventory read-back will be skipped');
  }
}

async function getInventoryLevel(shop: string, variantId: string, accessToken: string): Promise<number | null> {
  const url = `https://${shop}.myshopline.com/admin/openapi/v20230901/inventory_levels.json?variant_ids=${variantId}`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;
    const body = await res.json() as any;
    const levels = body?.inventory_levels || body?.items || [];
    if (!levels.length) return null;
    return levels[0]?.available ?? null;
  } catch {
    return null;
  }
}

async function run() {
  console.log('\n══════════════════════════════════════');
  console.log('   BLIND BOX BACKEND SMOKE TEST');
  console.log('══════════════════════════════════════');
  console.log(`  backend  : ${BACKEND_URL}`);
  console.log(`  shop     : ${SHOP}`);
  console.log(`  orderId  : ${ORDER_ID}`);
  console.log(`  product  : ${PRODUCT_ID}`);
  console.log(`  webhookId: ${WEBHOOK_ID}`);

  await preflight();

  const payload = buildOrderPayload(ORDER_ID, PRODUCT_ID);
  const body = JSON.stringify(payload);
  const hmac = signPayload(APP_SECRET, body);

  // Read inventory before
  let inventoryBefore: number | null = null;
  if (VARIANT_ID && ACCESS_TOKEN) {
    inventoryBefore = await getInventoryLevel(SHOP, VARIANT_ID, ACCESS_TOKEN);
    console.log(`\n── PRE-TEST INVENTORY: ${inventoryBefore ?? '(could not read)'}`);
  }

  // ── TEST 1: Webhook dispatch
  console.log('\n── TEST 1: Webhook dispatch ────────────');
  let res: any;
  try {
    res = await fetch(`${BACKEND_URL}/api/webhooks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'x-shopline-topic': 'orders/paid',
        'x-shopline-shop-domain': `${SHOP}.myshopline.com`,
        'x-shopline-hmac-sha256': hmac,
        'x-shopline-webhook-id': WEBHOOK_ID,
      },
      body,
    });
  } catch (err) {
    fail('Webhook network request', String(err));
    process.exit(1);
  }

  const resJson = await res.json() as any;
  const status = resJson?.data?.status;

  if (res.status === 200) {
    pass(`HTTP 200 received`);
  } else {
    fail(`HTTP 200 expected`, `got ${res.status}`);
  }

  if (status === 'processed') {
    pass('Assignment status = processed');
  } else if (status === 'ignored') {
    fail(
      'Assignment status = processed',
      `got "ignored" — product ${PRODUCT_ID} may not have blind-box tags on SHOPLINE. ` +
      'Add tags "blind-box" and "blind-box-collection:<handle>" to the product.'
    );
  } else if (status === 'failed') {
    fail('Assignment status = processed', `got "failed" — check backend logs. Response: ${JSON.stringify(resJson?.summary)}`);
  } else {
    fail('Assignment status = processed', `got "${status}"`);
  }

  // ── TEST 2: Idempotency replay
  console.log('\n── TEST 2: Idempotency replay ──────────');
  const replay = await fetch(`${BACKEND_URL}/api/webhooks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'x-shopline-topic': 'orders/paid',
      'x-shopline-shop-domain': `${SHOP}.myshopline.com`,
      'x-shopline-hmac-sha256': hmac,
      'x-shopline-webhook-id': WEBHOOK_ID,
    },
    body,
  });
  const replayJson = await replay.json() as any;
  const replayStatus = replayJson?.data?.status;

  if (replay.status === 200 && replayStatus === 'duplicate') {
    pass('Replay returns duplicate (idempotent)');
  } else {
    fail('Replay returns duplicate', `got HTTP ${replay.status} status="${replayStatus}"`);
  }

  // ── TEST 3: Inventory verification (execute mode only)
  if (VARIANT_ID && ACCESS_TOKEN) {
    console.log('\n── TEST 3: Inventory decrement ─────────');
    await new Promise((r) => setTimeout(r, 2000));
    const inventoryAfter = await getInventoryLevel(SHOP, VARIANT_ID, ACCESS_TOKEN);

    if (inventoryAfter === null) {
      fail('Read inventory after', 'Could not read from SHOPLINE inventory API');
    } else if (inventoryBefore === null) {
      fail('Compare inventory', 'Could not read pre-test inventory level');
    } else if (inventoryAfter === inventoryBefore - 1) {
      pass(`Inventory decremented ${inventoryBefore} → ${inventoryAfter}`);
    } else if (inventoryAfter === inventoryBefore) {
      fail(
        'Inventory decremented',
        `Level unchanged (${inventoryBefore}). Backend may be in DEFERRED mode — check BLIND_BOX_INVENTORY_EXECUTION_MODE.`
      );
    } else {
      fail('Inventory decremented', `Before=${inventoryBefore} After=${inventoryAfter} — unexpected delta`);
    }
  } else {
    console.log('\n── TEST 3: Inventory decrement ─────────');
    console.log('  ⚠  Skipped — set SMOKE_VARIANT_ID + SHOPLINE_ACCESS_TOKEN to enable');
  }

  // ── Summary
  console.log('\n══════════════════════════════════════');
  console.log(`   RESULT: ${failed === 0 ? 'ALL PASS ✓' : `${failed} FAILED ✗`}`);
  console.log(`   passed=${passed}  failed=${failed}`);
  console.log('══════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
