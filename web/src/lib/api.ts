// ── Types ────────────────────────────────────────────────────────────────────

export interface BlindBox {
  id: string;
  shop: string;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'archived';
  triggerProductId: string | null;
  triggerProductTitleSnapshot: string | null;
  configJson: string | null;
  createdAt: string;
  updatedAt: string;
  /** Present on the single-box GET (/pools/:id). */
  poolItems?: PoolItem[];
}

/** A reward product in a blind box's pool. Selection is inventory-weighted. */
export interface PoolItem {
  id: string;
  shop: string;
  blindBoxId: string;
  rewardProductId: string;
  rewardVariantId: string | null;
  rewardTitleSnapshot: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BlindBoxAssignment {
  id: string;
  shop: string;
  blindBoxId: string;
  orderId: string;
  orderLineId: string;
  rewardGroupId: string | null;
  selectedPoolItemId: string | null;
  selectedRewardProductId: string | null;
  selectedRewardVariantId: string | null;
  selectedRewardTitleSnapshot: string | null;
  selectedRewardVariantTitleSnapshot: string | null;
  selectedRewardPayloadJson: string | null;
  status: string;
  selectionStrategy: string | null;
  idempotencyKey: string;
  metadata: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookEvent {
  id: string;
  shop: string;
  topic: string;
  eventId: string;
  status: string;
  payload: string;
  errorMessage: string | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryOperation {
  id: string;
  shop: string;
  assignmentId: string | null;
  operationType: string;
  status: string;
  quantity: number;
  attemptCount: number;
  rewardTitleSnapshot: string | null;
  reason: string | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  totalBlindBoxes: number;
  activeBlindBoxes: number;
  totalAssignments: number;
  failedAssignments: number;
  webhookProcessed: number;
  webhookFailed: number;
  recentAssignments: Array<{
    id: string;
    orderId: string;
    status: string;
    rewardTitle: string | null;
    createdAt: string;
  }>;
}

export interface CatalogProduct {
  id: string;
  title: string | null;
  status: string | null;
  published: boolean | null;
  imageUrl: string | null;
  tags: string[];
  variantCount: number;
  variants: Array<{
    id: string;
    title: string | null;
    sku: string | null;
    inventoryQuantity: number | null;
  }>;
}

export interface HealthStatus {
  status: string;
  appKey: string;
  appUrl: string;
  executionMode: string;
  locationId: string;
  databaseMode: string;
  databaseHost: string;
  sessionMode: string;
}

// ── Session-expired error type ───────────────────────────────────────────────
// Thrown from request() whenever the backend signals re-auth is required (401
// with { authUrl } body, opaqueredirect from cross-origin auth middleware, or
// the SHOPLINE reauthorize header). Carries the authUrl so the UI can offer a
// one-click recovery and the global handler can auto-navigate top-frame.
export class SessionExpiredError extends Error {
  constructor(public authUrl?: string) {
    super('Session expired — please re-authenticate');
    this.name = 'SessionExpiredError';
  }
}

// Backend base URL (mirrors the value previously inlined in DashboardPage).
// Used to derive a fallback authUrl when the response doesn't include one
// (e.g. opaqueredirect — body is unreadable across origins).
const APP_BACKEND_URL =
  (import.meta.env.VITE_SHOPLINE_APP_URL as string | undefined)?.replace(/\/$/, '') ||
  'https://blind-box-test.onrender.com';

function deriveAuthUrlFallback(): string | undefined {
  const handle = getShopHandle();
  if (!handle) return undefined;
  return `${APP_BACKEND_URL}/auth?handle=${encodeURIComponent(handle)}`;
}

// ── Re-auth loop guard ─────────────────────────────────────────────────────
// OAuth for embedded apps must run at the TOP window. A scripted
// window.top.location assignment is blocked when the SHOPLINE admin iframe
// doesn't grant programmatic top-navigation, so the redirect silently happens
// inside the iframe, OAuth never completes, the app reloads, and we 401 again —
// an endless begin→reload loop (~1-2s each). Two changes break it:
//   1. Navigate OUR OWN frame to the backend /exit-iframe page (always allowed);
//      its <form target="_top"> performs the real top-frame navigation.
//   2. Count attempts in sessionStorage; after 2 within 30s, stop auto-looping
//      and show a manual "Reconnect" link instead.
const REAUTH_ATTEMPTS_KEY = 'bb_reauth_attempts';
const REAUTH_WINDOW_MS = 30_000;
const REAUTH_MAX_ATTEMPTS = 2;

function recentReauthAttempts(): number[] {
  try {
    const raw = sessionStorage.getItem(REAUTH_ATTEMPTS_KEY);
    const times: number[] = raw ? JSON.parse(raw) : [];
    const now = Date.now();
    return times.filter((t) => typeof t === 'number' && now - t < REAUTH_WINDOW_MS);
  } catch {
    return [];
  }
}

function recordReauthAttempt(): void {
  try {
    const times = recentReauthAttempts();
    times.push(Date.now());
    sessionStorage.setItem(REAUTH_ATTEMPTS_KEY, JSON.stringify(times));
  } catch {
    /* sessionStorage unavailable — proceed without the persistent guard */
  }
}

// Cleared once a request succeeds again, so a later genuine expiry isn't
// immediately treated as a loop.
function clearReauthGuard(): void {
  try {
    sessionStorage.removeItem(REAUTH_ATTEMPTS_KEY);
  } catch {
    /* ignore */
  }
}

// Wrap the OAuth entry URL (…/auth?handle=X) in our own /exit-iframe page so the
// top-frame breakout is done by a form submit, which works where scripted
// cross-origin top-navigation is blocked.
function toExitIframeUrl(authUrl: string): string {
  return `${APP_BACKEND_URL}/exit-iframe?redirectUri=${encodeURIComponent(authUrl)}`;
}

function showManualReauthLink(authUrl: string): void {
  if (typeof document === 'undefined' || !document.body) return;
  if (document.getElementById('bb-reauth-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'bb-reauth-overlay';
  overlay.setAttribute(
    'style',
    'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:#fff;font-family:system-ui,-apple-system,sans-serif;padding:24px;text-align:center',
  );
  const link = document.createElement('a');
  link.href = toExitIframeUrl(authUrl);
  link.target = '_top';
  link.rel = 'noopener';
  link.textContent = 'Reconnect the app';
  link.setAttribute(
    'style',
    'display:inline-block;background:#1f6feb;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:600',
  );
  const box = document.createElement('div');
  box.setAttribute('style', 'max-width:420px');
  const h = document.createElement('h2');
  h.textContent = 'Session expired';
  h.setAttribute('style', 'margin:0 0 8px;font-size:1.25rem');
  const p = document.createElement('p');
  p.textContent =
    "We couldn't re-authenticate automatically. Click below to reconnect the app to SHOPLINE.";
  p.setAttribute('style', 'margin:0 0 20px;color:#555;line-height:1.5');
  box.append(h, p, link);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

// Single-shot guard so a burst of parallel 401s doesn't kick off the navigation
// repeatedly within one page load.
let _autoRedirectAttempted = false;
function maybeAutoRedirect(authUrl: string | undefined): void {
  if (!authUrl) return;

  // Loop detected (already redirected twice in the last 30s) → stop and show a
  // manual link instead of hammering /auth on every reload.
  if (recentReauthAttempts().length >= REAUTH_MAX_ATTEMPTS) {
    showManualReauthLink(authUrl);
    return;
  }

  if (_autoRedirectAttempted) return;
  _autoRedirectAttempted = true;
  recordReauthAttempt();

  // Navigate our own frame to /exit-iframe; it breaks out to the top window
  // (where embedded-app OAuth must run) via a form submit.
  window.location.href = toExitIframeUrl(authUrl);
}

// ── App Bridge session token ──────────────────────────────────────────────────
// Populated by App.tsx once App Bridge is initialized.
// The ready-promise prevents a race where API calls fire before the dynamic
// import of @shoplinedev/appbridge resolves, which would send requests without
// a Bearer token, causing the auth middleware to redirect cross-origin and
// trigger a CORS-blocked TypeError ("Failed to fetch").
let _getSessionToken: (() => Promise<string>) | null = null;
let _appBridgeReadyResolve: () => void = () => {};
const _appBridgeReadyPromise = new Promise<void>((resolve) => {
  _appBridgeReadyResolve = resolve;
  setTimeout(resolve, 1500); // fallback: don't block forever if App Bridge never fires
});

export function initAppBridge(getToken: (() => Promise<string>) | null) {
  _getSessionToken = getToken;
  _appBridgeReadyResolve();
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  await _appBridgeReadyPromise; // wait for App Bridge to init (or 1.5s timeout)
  if (!_getSessionToken) return {};
  try {
    const token = await _getSessionToken();
    if (token) return { Authorization: `Bearer ${token}` };
  } catch {
    // Session token unavailable — fall through to cookie auth.
  }
  return {};
}

// ── Shop / handle parameter ───────────────────────────────────────────────────
// SHOPLINE Admin injects ?shop=<handle> (and ?handle=<handle>) into the INITIAL
// iframe URL only. With BrowserRouter, any client-side navigation (NavLink in
// Layout, <Link>, navigate()) replaces the path and WIPES window.location.search,
// so the handle vanishes after the first in-app click and every subsequent API
// call goes out handle-less → backend logs `handle: (none)` → 401.
//
// Fix: capture the handle the first time we see it in the URL and persist it to
// sessionStorage, then fall back to the stored value. This survives client-side
// navigation and in-iframe reloads for the life of the tab, with no need to
// thread search params through every Link/navigate call.
// Exported so other modules can build auth redirect URLs.
const HANDLE_STORAGE_KEY = 'bb_shop_handle';

export function getShopHandle(): string {
  try {
    const p = new URLSearchParams(window.location.search);
    const fromUrl = p.get('shop') ?? p.get('handle') ?? p.get('store') ?? '';
    if (fromUrl) {
      try { sessionStorage.setItem(HANDLE_STORAGE_KEY, fromUrl); } catch { /* ignore */ }
      return fromUrl;
    }
    // URL no longer carries it (post-navigation) — use the captured value.
    try { return sessionStorage.getItem(HANDLE_STORAGE_KEY) ?? ''; } catch { return ''; }
  } catch {
    return '';
  }
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const handle = getShopHandle();
  const sep = path.includes('?') ? '&' : '?';
  // Send as "handle" — the param name shopline-app-express actually looks for
  const url = handle ? `/api/blind-box${path}${sep}handle=${encodeURIComponent(handle)}` : `/api/blind-box${path}`;

  const resp = await fetch(url, {
    ...init,
    redirect: 'manual', // don't follow redirects — they mean auth failed
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...init.headers,
    },
    credentials: 'include', // send session cookie as fallback
  });

  // opaqueredirect = auth middleware issued a cross-origin redirect (exitIframe flow).
  // X-SHOPLINE-API-Request-Failure-Reauthorize: 1 = appBridgeHeaderRedirect (403).
  // Body is unreadable across opaque redirects, so we derive authUrl from the
  // shop handle in the current location.
  if (
    resp.type === 'opaqueredirect' ||
    (resp.redirected && resp.url.includes('/auth')) ||
    resp.headers.get('X-SHOPLINE-API-Request-Failure-Reauthorize') === '1'
  ) {
    const authUrl = deriveAuthUrlFallback();
    maybeAutoRedirect(authUrl);
    throw new SessionExpiredError(authUrl);
  }

  const text = await resp.text();
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(text); } catch { /* ignore */ }

  // 401 from requireShoplineSession carries { error, authUrl } so the UI can
  // navigate the merchant straight back through OAuth.
  if (resp.status === 401) {
    const authUrl =
      (body as { authUrl?: string }).authUrl || deriveAuthUrlFallback();
    maybeAutoRedirect(authUrl);
    throw new SessionExpiredError(authUrl);
  }

  if (!resp.ok) {
    const message =
      (body as { error?: string; message?: string }).error ||
      (body as { error?: string; message?: string }).message ||
      `HTTP ${resp.status} ${resp.statusText}`;
    throw new Error(message);
  }

  // Reached a healthy response → the session is valid, so reset the re-auth
  // loop guard for any future genuine expiry.
  clearReauthGuard();

  return (body as { data: T }).data ?? (body as unknown as T);
}

// ── API endpoints ─────────────────────────────────────────────────────────────

export const api = {
  // Dashboard
  getStats(): Promise<DashboardStats> {
    return request<DashboardStats>('/stats');
  },

  getHealth(): Promise<HealthStatus> {
    return fetch('/api/health', { credentials: 'include' }).then((r) => r.json());
  },

  // Blind Boxes
  listBlindBoxes(): Promise<BlindBox[]> {
    return request<BlindBox[]>('/pools');
  },

  getBlindBox(id: string): Promise<BlindBox> {
    return request<BlindBox>(`/pools/${id}`);
  },

  // Default: auto-creates the sellable SHOPLINE product (name + price [+ image]).
  // Advanced: pass triggerProductId to link an existing product instead.
  createBlindBox(payload: {
    name: string;
    price?: string | number;
    description?: string | null;
    imageUrl?: string | null;
    triggerProductId?: string;
    triggerProductTitleSnapshot?: string | null;
  }): Promise<BlindBox> {
    return request<BlindBox>('/pools', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateBlindBox(
    id: string,
    payload: {
      name?: string;
      description?: string | null;
      status?: string;
      triggerProductId?: string | null;
    },
  ): Promise<BlindBox> {
    return request<BlindBox>(`/pools/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  getReadiness(blindBoxId: string): Promise<unknown> {
    return request<unknown>(`/pools/${blindBoxId}/readiness`);
  },

  getRewardCandidates(blindBoxId: string): Promise<unknown> {
    return request<unknown>(`/pools/${blindBoxId}/reward-candidates`);
  },

  // Reward pool (blind_box_pool_items)
  listRewards(blindBoxId: string): Promise<PoolItem[]> {
    return request<PoolItem[]>(`/pools/${blindBoxId}/rewards`);
  },

  addReward(
    blindBoxId: string,
    payload: { rewardProductId: string; rewardVariantId?: string | null; rewardTitleSnapshot?: string | null },
  ): Promise<PoolItem> {
    return request<PoolItem>(`/pools/${blindBoxId}/rewards`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  removeReward(blindBoxId: string, poolItemId: string): Promise<{ id: string }> {
    return request<{ id: string }>(`/pools/${blindBoxId}/rewards/${poolItemId}`, {
      method: 'DELETE',
    });
  },

  // Assignments
  listAssignments(): Promise<BlindBoxAssignment[]> {
    return request<BlindBoxAssignment[]>('/assignments');
  },

  // Inventory Operations
  listInventoryOperations(): Promise<InventoryOperation[]> {
    return request<InventoryOperation[]>('/inventory-operations');
  },

  retryInventoryOperation(operationId: string): Promise<unknown> {
    return request<unknown>(`/inventory-operations/${operationId}/retry`, {
      method: 'POST',
    });
  },

  // Webhook Events
  // Retry always returns 200 — check ok/status fields to determine outcome.
  retryWebhookEvent(id: string): Promise<{
    ok: boolean;
    eventId: string;
    status: string;
    assignmentCount?: number;
    failureCount?: number;
    summary?: unknown;
    errorCode?: string;
    message?: string;
  }> {
    return request(`/webhook-events/${encodeURIComponent(id)}/retry`, { method: 'POST' });
  },

  listWebhookEvents(params?: { status?: string; topic?: string }): Promise<WebhookEvent[]> {
    const qs = params
      ? '?' + new URLSearchParams(
          Object.entries(params).filter(([, v]) => Boolean(v)) as [string, string][],
        ).toString()
      : '';
    return request<WebhookEvent[]>(`/webhook-events${qs}`);
  },

  // Catalog pickers
  listCatalogProducts(): Promise<CatalogProduct[]> {
    return request<CatalogProduct[]>('/catalog/products');
  },

  getCatalogProduct(productId: string): Promise<CatalogProduct> {
    return request<CatalogProduct>(`/catalog/products/${encodeURIComponent(productId)}`);
  },
};
