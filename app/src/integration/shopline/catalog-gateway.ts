import fetch from 'node-fetch';
import { getRuntimeConfig } from '../../lib/config';
import { logger } from '../../lib/logger';

export interface ShoplineCollection {
  id: string;
  title: string | null;
  handle: string | null;
  type: 'collection';
  status: string | null;
  raw: unknown;
}

export interface ShoplineProductVariant {
  id: string;
  title: string | null;
  sku: string | null;
  inventoryQuantity: number | null;
  tracked: boolean | null;
  available: boolean | null;
  raw: unknown;
}

export interface ShoplineProduct {
  id: string;
  title: string | null;
  status: string | null;
  published: boolean | null;
  tags?: string[];
  templatePath?: string | null;
  productType?: string | null;
  variants: ShoplineProductVariant[];
  raw: unknown;
}

export interface CollectionProductsPage {
  products: ShoplineProduct[];
  nextPageInfo: string | null;
  traceId: string | null;
}

export class CatalogGatewayError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(message: string, options: { code: string; statusCode?: number; details?: Record<string, unknown> }) {
    super(message);
    this.name = 'CatalogGatewayError';
    this.code = options.code;
    this.statusCode = options.statusCode || 500;
    this.details = options.details;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item));
}

function readStringField(record: Record<string, unknown> | null, fieldNames: string[]): string | null {
  if (!record) {
    return null;
  }

  for (const fieldName of fieldNames) {
    const value = record[fieldName];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

function readBooleanField(record: Record<string, unknown> | null, fieldNames: string[]): boolean | null {
  if (!record) {
    return null;
  }

  for (const fieldName of fieldNames) {
    const value = record[fieldName];
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      return value === 1;
    }

    if (typeof value === 'string') {
      const normalizedValue = value.trim().toLowerCase();
      if (['true', 'active', 'enabled', 'published'].includes(normalizedValue)) {
        return true;
      }

      if (['false', 'inactive', 'disabled', 'draft', 'archived', 'unpublished'].includes(normalizedValue)) {
        return false;
      }
    }
  }

  return null;
}

function readNumberField(record: Record<string, unknown> | null, fieldNames: string[]): number | null {
  if (!record) {
    return null;
  }

  for (const fieldName of fieldNames) {
    const value = record[fieldName];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      const parsedValue = Number(value);
      if (Number.isFinite(parsedValue)) {
        return parsedValue;
      }
    }
  }

  return null;
}

function normalizeShoplineResourceId(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  const gidMatch = trimmedValue.match(/^gid:\/\/shopline\/[^/]+\/([^/?#]+)$/i);
  if (gidMatch?.[1]) {
    return gidMatch[1];
  }

  return trimmedValue;
}

function parseLinkHeader(linkHeader: string | null): string | null {
  if (!linkHeader) {
    return null;
  }

  const match = linkHeader.match(/[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/i);
  return match?.[1] || null;
}

function extractCollectionRecord(payload: unknown): Record<string, unknown> | null {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }

  return asRecord(record.collection) || asRecord(record.data) || record;
}

function extractProductRecords(payload: unknown): Record<string, unknown>[] {
  const record = asRecord(payload);
  if (!record) {
    return [];
  }

  // Try direct top-level keys first (SHOPLINE returns { products: [...] } or { list: [...] })
  const direct =
    asRecordArray(record.products) ||
    asRecordArray(record.list) ||
    asRecordArray(record.items);
  if (direct.length > 0) {
    return direct;
  }

  // Try nested under a "data" wrapper
  const dataRecord = asRecord(record.data);
  if (!dataRecord) {
    return [];
  }

  return (
    asRecordArray(dataRecord.products) ||
    asRecordArray(dataRecord.list) ||
    asRecordArray(dataRecord.items)
  );
}

function extractVariantRecords(productRecord: Record<string, unknown> | null): Record<string, unknown>[] {
  if (!productRecord) {
    return [];
  }

  return (
    asRecordArray(productRecord.variants) ||
    asRecordArray(productRecord.product_variants) ||
    asRecordArray(productRecord.items)
  );
}

function mapVariantRecord(variantRecord: Record<string, unknown>): ShoplineProductVariant | null {
  const id = readStringField(variantRecord, ['id', 'variant_id']);
  if (!id) {
    return null;
  }

  return {
    id,
    title: readStringField(variantRecord, ['title', 'name']),
    sku: readStringField(variantRecord, ['sku']),
    inventoryQuantity: readNumberField(variantRecord, ['inventory_quantity', 'inventoryQuantity']),
    tracked: readBooleanField(variantRecord, ['tracked', 'inventory_tracked', 'inventoryTracked']),
    available: readBooleanField(variantRecord, ['available', 'published', 'enabled']),
    raw: variantRecord,
  };
}

/**
 * Normalise tags from whatever shape SHOPLINE returns into a trimmed lowercase
 * string array.  SHOPLINE has returned tags as:
 *   - array of strings       ["blind-box", "sale"]
 *   - comma-separated string "blind-box, sale"
 *   - alternative field names: tagList, product_tags, labels, productTags
 */
export function normalizeTags(productRecord: Record<string, unknown>): string[] {
  const raw =
    productRecord.tags ??
    productRecord.tagList ??
    productRecord.tag_list ??
    productRecord.product_tags ??
    productRecord.labels ??
    productRecord.productTags;

  if (Array.isArray(raw)) {
    return raw
      .map((t) => String(t).trim().toLowerCase())
      .filter(Boolean);
  }

  if (typeof raw === 'string' && raw.trim()) {
    return raw
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
  }

  return [];
}

function mapProductRecord(productRecord: Record<string, unknown>): ShoplineProduct | null {
  const id = readStringField(productRecord, ['id', 'product_id']);
  if (!id) {
    return null;
  }

  return {
    id,
    title: readStringField(productRecord, ['title', 'name']),
    status: readStringField(productRecord, ['status']),
    published:
      readBooleanField(productRecord, ['published', 'is_published', 'active', 'enabled']) ??
      null,
    tags: normalizeTags(productRecord),
    templatePath: readStringField(productRecord, ['template_path', 'templatePath']),
    productType: readStringField(productRecord, ['product_type', 'productType']),
    variants: extractVariantRecords(productRecord)
      .map(mapVariantRecord)
      .filter((variant): variant is ShoplineProductVariant => Boolean(variant)),
    raw: productRecord,
  };
}

interface CatalogRequestResult<T> {
  data: T;
  traceId: string | null;
  nextPageInfo: string | null;
}

interface GraphqlRequestResult<T> {
  data: T;
  traceId: string | null;
}

export interface CollectionsPage {
  collections: ShoplineCollection[];
  nextPageInfo: string | null;
  traceId: string | null;
}

export interface CatalogGateway {
  getProduct(shop: string, accessToken: string, productId: string): Promise<ShoplineProduct>;
  getCollection(shop: string, accessToken: string, collectionId: string): Promise<ShoplineCollection>;
  getCollectionByHandle(shop: string, accessToken: string, handle: string): Promise<ShoplineCollection>;
  getProductsPage(
    shop: string,
    accessToken: string,
    options?: {
      pageInfo?: string | null;
      limit?: number;
    },
  ): Promise<CollectionProductsPage>;
  getCollectionProductsPage(
    shop: string,
    accessToken: string,
    collectionId: string,
    options?: {
      pageInfo?: string | null;
      limit?: number;
    },
  ): Promise<CollectionProductsPage>;
  getCollectionsPage(
    shop: string,
    accessToken: string,
    options?: {
      pageInfo?: string | null;
      limit?: number;
    },
  ): Promise<CollectionsPage>;
}

export class ShoplineCatalogGateway implements CatalogGateway {
  private readonly apiVersion: string;

  constructor(apiVersion = getRuntimeConfig().shoplineAdminApiVersion) {
    this.apiVersion = apiVersion;
  }

  async getProduct(shop: string, accessToken: string, productId: string): Promise<ShoplineProduct> {
    const normalizedProductId = normalizeShoplineResourceId(productId);
    if (!normalizedProductId) {
      throw new CatalogGatewayError('A SHOPLINE product id is required', {
        code: 'SHOPLINE_PRODUCT_ID_REQUIRED',
        statusCode: 400,
      });
    }

    const response = await this.request<unknown>(shop, accessToken, `/products/${encodeURIComponent(normalizedProductId)}.json`);
    const productRecord = asRecord(asRecord(response.data)?.product) || asRecord(asRecord(response.data)?.data) || asRecord(response.data);
    const product = productRecord ? mapProductRecord(productRecord) : null;

    if (!product) {
      throw new CatalogGatewayError('SHOPLINE product could not be loaded', {
        code: 'SHOPLINE_PRODUCT_NOT_FOUND',
        statusCode: 404,
        details: {
          productId: normalizedProductId,
          traceId: response.traceId,
        },
      });
    }

    return product;
  }

  async getCollection(shop: string, accessToken: string, collectionId: string): Promise<ShoplineCollection> {
    const normalizedCollectionId = normalizeShoplineResourceId(collectionId);
    if (!normalizedCollectionId) {
      throw new CatalogGatewayError('A SHOPLINE collection id is required', {
        code: 'SHOPLINE_COLLECTION_ID_REQUIRED',
        statusCode: 400,
      });
    }

    const response = await this.request<unknown>(
      shop,
      accessToken,
      `/products/collections/${encodeURIComponent(normalizedCollectionId)}.json`,
    );
    const collectionRecord = extractCollectionRecord(response.data);
    const id = readStringField(collectionRecord, ['id', 'collection_id']) || normalizedCollectionId;

    return {
      id,
      title: readStringField(collectionRecord, ['title', 'name']),
      handle: readStringField(collectionRecord, ['handle']),
      type: 'collection',
      status: readStringField(collectionRecord, ['status']),
      raw: response.data,
    };
  }

  async getCollectionByHandle(shop: string, accessToken: string, handle: string): Promise<ShoplineCollection> {
    const normalizedHandle = handle.trim();
    if (!normalizedHandle) {
      throw new CatalogGatewayError('A SHOPLINE collection handle is required', {
        code: 'SHOPLINE_COLLECTION_HANDLE_REQUIRED',
        statusCode: 400,
      });
    }

    const response = await this.graphqlRequest<{
      data?: {
        collectionByHandle?: {
          id?: string;
          title?: string | null;
          handle?: string | null;
          updatedAt?: string | null;
        } | null;
      };
    }>(
      shop,
      accessToken,
      `
        query CollectionByHandle($handle: String!) {
          collectionByHandle(handle: $handle) {
            id
            title
            handle
            updatedAt
          }
        }
      `,
      {
        handle: normalizedHandle,
      },
    );

    const collection = response.data?.data?.collectionByHandle || null;
    if (!collection?.id) {
      throw new CatalogGatewayError('SHOPLINE collection could not be loaded from the provided handle', {
        code: 'SHOPLINE_COLLECTION_HANDLE_NOT_FOUND',
        statusCode: 404,
        details: {
          handle: normalizedHandle,
          traceId: response.traceId,
        },
      });
    }

    return {
      id: normalizeShoplineResourceId(collection.id) || collection.id,
      title: collection.title || null,
      handle: collection.handle || normalizedHandle,
      type: 'collection',
      status: null,
      raw: response.data,
    };
  }

  async getProductsPage(
    shop: string,
    accessToken: string,
    options: {
      pageInfo?: string | null;
      limit?: number;
    } = {},
  ): Promise<CollectionProductsPage> {
    const pageSize = Math.min(options.limit || 250, 250);
    const pageNo = options.pageInfo ? parseInt(options.pageInfo, 10) || 1 : 1;

    const query = new URLSearchParams();
    query.set('page_size', String(pageSize));
    query.set('page_no', String(pageNo));

    // Try known SHOPLINE product list paths in order; log every failure so the
    // Render logs show the exact status + response body for each attempt.
    const candidatePaths = [
      `/products/list.json?${query.toString()}`,
      `/products.json?${query.toString()}`,
    ];

    for (const path of candidatePaths) {
      let response: CatalogRequestResult<unknown>;
      try {
        response = await this.request<unknown>(shop, accessToken, path);
      } catch (err) {
        const details = err instanceof CatalogGatewayError ? err.details : {};
        logger.warn('SHOPLINE products candidate path failed — trying next', {
          shop,
          path,
          shoplineStatus: err instanceof CatalogGatewayError ? err.statusCode : null,
          responsePreview: typeof details?.responseText === 'string'
            ? details.responseText.slice(0, 400)
            : null,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      const rawRecord = asRecord(response.data);
      logger.info('SHOPLINE products response shape', {
        shop,
        path,
        pageNo,
        topLevelKeys: rawRecord ? Object.keys(rawRecord) : [],
        traceId: response.traceId,
      });

      const products = extractProductRecords(response.data)
        .map(mapProductRecord)
        .filter((product): product is ShoplineProduct => Boolean(product));

      const total = readNumberField(rawRecord, ['total', 'total_count', 'totalCount', 'count']);
      const hasMore = total !== null
        ? pageNo * pageSize < total
        : products.length === pageSize;

      return {
        products,
        nextPageInfo: hasMore ? String(pageNo + 1) : null,
        traceId: response.traceId,
      };
    }

    // All paths failed — return empty so the service loop stops cleanly.
    logger.warn('SHOPLINE products endpoint unavailable — returning empty page', {
      shop,
      candidatePaths,
    });
    return { products: [], nextPageInfo: null, traceId: null };
  }

  async getCollectionProductsPage(
    shop: string,
    accessToken: string,
    collectionId: string,
    options: {
      pageInfo?: string | null;
      limit?: number;
    } = {},
  ): Promise<CollectionProductsPage> {
    const normalizedCollectionId = normalizeShoplineResourceId(collectionId);
    if (!normalizedCollectionId) {
      throw new CatalogGatewayError('A SHOPLINE collection id is required', {
        code: 'SHOPLINE_COLLECTION_ID_REQUIRED',
        statusCode: 400,
      });
    }

    const pageSize = Math.min(options.limit || 250, 250);
    const pageNo = options.pageInfo ? parseInt(options.pageInfo, 10) || 1 : 1;

    const query = new URLSearchParams();
    query.set('page_size', String(pageSize));
    query.set('page_no', String(pageNo));
    query.set('category_id', normalizedCollectionId);

    const response = await this.request<unknown>(
      shop,
      accessToken,
      `/products/list.json?${query.toString()}`,
    );

    const rawRecord = asRecord(response.data);
    const products = extractProductRecords(response.data)
      .map(mapProductRecord)
      .filter((product): product is ShoplineProduct => Boolean(product));

    const total = readNumberField(rawRecord, ['total', 'total_count', 'totalCount', 'count']);
    const hasMore = total !== null ? pageNo * pageSize < total : products.length === pageSize;

    return {
      products,
      nextPageInfo: hasMore ? String(pageNo + 1) : null,
      traceId: response.traceId,
    };
  }

  async getCollectionsPage(
    shop: string,
    accessToken: string,
    options: {
      pageInfo?: string | null;
      limit?: number;
    } = {},
  ): Promise<CollectionsPage> {
    const pageSize = Math.min(options.limit || 250, 250);
    const pageNo = options.pageInfo ? parseInt(options.pageInfo, 10) || 1 : 1;

    const query = new URLSearchParams();
    query.set('page_size', String(pageSize));
    query.set('page_no', String(pageNo));

    // SHOPLINE may call collections "categories" — try most likely paths in order.
    // /products/collections.json returned 406 in testing; these alternatives match
    // known SHOPLINE OpenAPI patterns.
    const candidatePaths = [
      `/products/categories/list.json?${query.toString()}`,
      `/categories/list.json?${query.toString()}`,
      `/custom_collections/list.json?${query.toString()}`,
    ];

    for (const path of candidatePaths) {
      let response: CatalogRequestResult<unknown>;
      try {
        response = await this.request<unknown>(shop, accessToken, path);
      } catch (err) {
        logger.debug('SHOPLINE collections candidate path failed — trying next', {
          shop,
          path,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      const record = asRecord(response.data);
      logger.debug('SHOPLINE collections response shape', {
        shop,
        path,
        topLevelKeys: record ? Object.keys(record) : [],
      });

      const collectionsArray =
        asRecordArray(record?.collections) ||
        asRecordArray(record?.categories) ||
        asRecordArray(record?.list) ||
        asRecordArray((asRecord(record?.data))?.collections) ||
        asRecordArray((asRecord(record?.data))?.categories) ||
        asRecordArray((asRecord(record?.data))?.list) ||
        [];

      const collections = collectionsArray
        .map((collectionRecord): ShoplineCollection | null => {
          const id = readStringField(collectionRecord, ['id', 'collection_id', 'category_id']);
          if (!id) return null;
          return {
            id: normalizeShoplineResourceId(id) || id,
            title: readStringField(collectionRecord, ['title', 'name']),
            handle: readStringField(collectionRecord, ['handle', 'slug']),
            type: 'collection',
            status: readStringField(collectionRecord, ['status']),
            raw: collectionRecord,
          };
        })
        .filter((c): c is ShoplineCollection => Boolean(c));

      const total = readNumberField(record, ['total', 'total_count', 'totalCount', 'count']);
      const hasMore = total !== null ? pageNo * pageSize < total : collections.length === pageSize;

      return {
        collections,
        nextPageInfo: hasMore ? String(pageNo + 1) : null,
        traceId: response.traceId,
      };
    }

    // All known collection paths failed — collections may not be supported by this
    // API version or scopes. Return empty so the UI degrades gracefully.
    logger.warn('SHOPLINE collections endpoint unavailable — returning empty list', {
      shop,
      candidatePaths,
    });
    return { collections: [], nextPageInfo: null, traceId: null };
  }

  private async request<T>(
    shop: string,
    accessToken: string,
    path: string,
  ): Promise<CatalogRequestResult<T>> {
    const url = `https://${shop}.myshopline.com/admin/openapi/${this.apiVersion}${path}`;

    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json; charset=utf-8',
          'User-Agent': 'blind-box-backend/catalog-gateway',
        },
      });
    } catch (error) {
      throw new CatalogGatewayError(
        error instanceof Error ? error.message : 'SHOPLINE catalog request failed before a response was received',
        {
          code: 'SHOPLINE_CATALOG_NETWORK_ERROR',
          statusCode: 502,
        },
      );
    }

    const traceId = response.headers.get('traceid')?.split(',')?.[0] || null;
    const nextPageInfo = parseLinkHeader(response.headers.get('link'));
    const responseText = await response.text();

    if (!response.ok) {
      throw new CatalogGatewayError(
        `SHOPLINE catalog request failed with ${response.status} ${response.statusText}`,
        {
          code: 'SHOPLINE_CATALOG_HTTP_ERROR',
          statusCode: response.status,
          details: {
            path,
            traceId,
            responseText,
          },
        },
      );
    }

    const data = responseText ? (JSON.parse(responseText) as T) : ({} as T);

    return {
      data,
      traceId,
      nextPageInfo,
    };
  }

  private async graphqlRequest<T>(
    shop: string,
    accessToken: string,
    query: string,
    variables: Record<string, unknown>,
  ): Promise<GraphqlRequestResult<T>> {
    const url = `https://${shop}.myshopline.com/admin/graph/${this.apiVersion}/graphql.json`;

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json; charset=utf-8',
          'User-Agent': 'blind-box-backend/catalog-gateway',
        },
        body: JSON.stringify({
          query,
          variables,
        }),
      });
    } catch (error) {
      throw new CatalogGatewayError(
        error instanceof Error ? error.message : 'SHOPLINE GraphQL request failed before a response was received',
        {
          code: 'SHOPLINE_GRAPHQL_NETWORK_ERROR',
          statusCode: 502,
        },
      );
    }

    const traceId = response.headers.get('traceid')?.split(',')?.[0] || null;
    const responseText = await response.text();

    if (!response.ok) {
      throw new CatalogGatewayError(
        `SHOPLINE GraphQL request failed with ${response.status} ${response.statusText}`,
        {
          code: 'SHOPLINE_GRAPHQL_HTTP_ERROR',
          statusCode: response.status,
          details: {
            traceId,
            responseText,
          },
        },
      );
    }

    const data = responseText ? (JSON.parse(responseText) as T) : ({} as T);
    const errors = asRecord(data as unknown)?.errors;
    if (Array.isArray(errors) && errors.length > 0) {
      throw new CatalogGatewayError('SHOPLINE GraphQL request returned errors', {
        code: 'SHOPLINE_GRAPHQL_ERRORS',
        statusCode: 502,
        details: {
          traceId,
          errors,
        },
      });
    }

    return {
      data,
      traceId,
    };
  }
}
