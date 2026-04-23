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

export interface ApiError {
  message: string;
  code?: string;
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const resp = await fetch(`/api/blind-box${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  const text = await resp.text();
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(text); } catch { /* ignore */ }

  if (!resp.ok) {
    const message =
      (body as { error?: string; message?: string }).error ||
      (body as { error?: string; message?: string }).message ||
      `HTTP ${resp.status}`;
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
    return fetch('/api/health').then((r) => r.json());
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
  listWebhookEvents(params?: { status?: string; topic?: string }): Promise<WebhookEvent[]> {
    const qs = params
      ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => Boolean(v)) as [string, string][]).toString()
      : '';
    return request<WebhookEvent[]>(`/webhook-events${qs}`);
  },

  // Catalog pickers
  listCatalogProducts(): Promise<CatalogProduct[]> {
    return request<CatalogProduct[]>('/catalog/products');
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
