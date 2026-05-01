// ── Types ────────────────────────────────────────────────────────────────────

export interface BlindBox {
  id: string;
  shop: string;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'archived';
  selectionStrategy: 'uniform' | 'weighted';
  shoplineProductId: string | null;
  shoplineVariantId: string | null;
  productTitleSnapshot: string | null;
  configJson: string | null;
  createdAt: string;
  updatedAt: string;
  rewardGroupLink?: RewardGroupLink | null;
  rewardGroup?: RewardGroup | null;
}

export interface RewardGroup {
  id: string;
  shop: string;
  sourceType: 'shopline_collection';
  shoplineCollectionId: string;
  collectionTitleSnapshot: string | null;
  status: 'draft' | 'active' | 'archived';
  configJson: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RewardGroupLink {
  id: string;
  shop: string;
  blindBoxId: string;
  rewardGroupId: string;
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
  tags: string[];
  variantCount: number;
  variants: Array<{
    id: string;
    title: string | null;
    sku: string | null;
    inventoryQuantity: number | null;
  }>;
}

export interface CatalogCollection {
  id: string;
  title: string | null;
  handle: string | null;
  status: string | null;
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
// SHOPLINE Admin injects ?shop=<handle> into the iframe URL.
// The @shoplineos/shopline-app-express library expects ?handle=<handle> for
// session fallback lookups, so we read "shop" but forward it as "handle".
// Exported so other modules can build auth redirect URLs.
export function getShopHandle(): string {
  try {
    const p = new URLSearchParams(window.location.search);
    return p.get('shop') ?? p.get('handle') ?? p.get('store') ?? '';
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
  // 401 from our requireShoplineSession middleware carries a JSON body with error/authUrl
  //   and is handled below in the !resp.ok branch.
  if (
    resp.type === 'opaqueredirect' ||
    (resp.redirected && resp.url.includes('/auth')) ||
    resp.headers.get('X-SHOPLINE-API-Request-Failure-Reauthorize') === '1'
  ) {
    throw new Error('Session expired — please reload the page in SHOPLINE Admin');
  }

  const text = await resp.text();
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(text); } catch { /* ignore */ }

  if (!resp.ok) {
    const message =
      (body as { error?: string; message?: string }).error ||
      (body as { error?: string; message?: string }).message ||
      `HTTP ${resp.status} ${resp.statusText}`;
    throw new Error(message);
  }

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

  updateBlindBox(
    id: string,
    payload: {
      name?: string;
      description?: string | null;
      status?: string;
      selectionStrategy?: string;
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

  // Reward Groups (collections)
  listRewardGroups(): Promise<RewardGroup[]> {
    return request<RewardGroup[]>('/reward-groups');
  },

  createRewardGroup(payload: {
    shoplineCollectionId: string;
    collectionTitleSnapshot?: string | null;
    status?: string;
  }): Promise<RewardGroup> {
    return request<RewardGroup>('/reward-groups', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Reward Group Links
  listRewardGroupLinks(): Promise<RewardGroupLink[]> {
    return request<RewardGroupLink[]>('/reward-group-links');
  },

  upsertRewardGroupLink(payload: {
    blindBoxId: string;
    rewardGroupId: string;
  }): Promise<RewardGroupLink> {
    return request<RewardGroupLink>('/reward-group-links', {
      method: 'POST',
      body: JSON.stringify(payload),
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

  listCatalogCollections(): Promise<CatalogCollection[]> {
    return request<CatalogCollection[]>('/catalog/collections');
  },

  // Debug
  getProduct(productId: string): Promise<unknown> {
    return request<unknown>(`/debug/products/${productId}`);
  },

  getCollection(collectionId: string): Promise<unknown> {
    return request<unknown>(`/debug/collections/${collectionId}`);
  },
};
