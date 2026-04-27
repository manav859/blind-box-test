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
    const limit = Math.min(options.limit || 250, 250);
    const query = new URLSearchParams({ limit: String(limit) });
    if (options.pageInfo) query.set('page_info', options.pageInfo);

    // Correct SHOPLINE Admin OpenAPI product list endpoint (v20260901+).
    // Path:  /admin/openapi/{version}/products/products.json
    // The gateway's request() method prepends /admin/openapi/{version}, so path = /products/products.json.
    const path = `/products/products.json?${query.toString()}`;

    try {
      const response = await this.request<unknown>(shop, accessToken, path);

      const rawRecord = asRecord(response.data);
      const products = extractProductRecords(response.data)
        .map(mapProductRecord)
        .filter((p): p is ShoplineProduct => Boolean(p));

      logger.info('SHOPLINE products/products.json response', {
        shop,
        apiVersion: this.apiVersion,
        path,
        productCount: products.length,
        nextPageInfo: response.nextPageInfo,
        topLevelKeys: rawRecord ? Object.keys(rawRecord) : [],
        sampleProduct: products[0]
          ? { id: products[0].id, title: products[0].title, tagsRaw: (products[0].raw as Record<string, unknown>)?.tags, tagsNormalized: products[0].tags }
          : null,
      });

      return {
        products,
        nextPageInfo: response.nextPageInfo,
        traceId: response.traceId,
      };
    } catch (restErr) {
      const status = restErr instanceof CatalogGatewayError ? restErr.statusCode : null;
      const preview = restErr instanceof CatalogGatewayError
        ? String(restErr.details?.responseText ?? '').slice(0, 300)
        : null;
      logger.warn('SHOPLINE REST product listing failed — falling back to GraphQL', {
        shop,
        apiVersion: this.apiVersion,
        path,
        shoplineStatus: status,
        responsePreview: preview,
      });
      // GraphQL fallback (works when REST listing is unavailable).
      return this.getProductsPageViaGraphQL(shop, accessToken, limit, options.pageInfo || null);
    }
  }

  private async getProductsPageViaGraphQL(
    shop: string,
    accessToken: string,
    first: number,
    after: string | null,
  ): Promise<CollectionProductsPage> {
    type GqlProductsResponse = {
      data?: {
        products?: {
          edges?: Array<{
            node?: {
              id?: string;
              title?: string;
              status?: string;
              tags?: string[] | string;
              tag_list?: string[] | string;
              handle?: string;
              product_type?: string;
              productType?: string;
              variants?: {
                edges?: Array<{
                  node?: {
                    id?: string;
                    title?: string;
                    sku?: string;
                    inventoryQuantity?: number;
                    inventory_quantity?: number;
                  };
                }>;
              };
            };
          }>;
          pageInfo?: {
            hasNextPage?: boolean;
            endCursor?: string | null;
          };
        };
      };
    };

    const gqlResponse = await this.graphqlRequest<GqlProductsResponse>(
      shop,
      accessToken,
      `
        query GetProducts($first: Int!, $after: String) {
          products(first: $first, after: $after) {
            edges {
              node {
                id
                title
                status
                tags
                variants(first: 100) {
                  edges {
                    node {
                      id
                      title
                      sku
                      inventoryQuantity
                    }
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `,
      { first, after },
    );

    const productsConn = gqlResponse.data?.data?.products;
    const edges = productsConn?.edges ?? [];
    const pageInfo = productsConn?.pageInfo;

    logger.info('SHOPLINE GraphQL products response', {
      shop,
      edgeCount: edges.length,
      hasNextPage: pageInfo?.hasNextPage,
      endCursor: pageInfo?.endCursor ?? null,
      // Log the raw node of the first product so we can see exact field shapes.
      sampleNode: edges[0]?.node
        ? {
            id: edges[0].node.id,
            title: edges[0].node.title,
            status: edges[0].node.status,
            tagsRaw: edges[0].node.tags,
            variantEdges: edges[0].node.variants?.edges?.length,
          }
        : null,
    });

    const products: ShoplineProduct[] = edges
      .map((edge) => {
        const node = edge?.node;
        if (!node?.id) return null;

        const rawTags = node.tags ?? node.tag_list;
        const tags = normalizeTags({ tags: rawTags });

        const variants: ShoplineProductVariant[] = (node.variants?.edges ?? [])
          .flatMap((ve): ShoplineProductVariant[] => {
            const v = ve?.node;
            if (!v?.id) return [];
            return [{
              id: normalizeShoplineResourceId(v.id) || v.id,
              title: v.title ?? null,
              sku: v.sku ?? null,
              inventoryQuantity: v.inventoryQuantity ?? v.inventory_quantity ?? null,
              tracked: null,
              available: null,
              raw: v,
            }];
          });

        const product: ShoplineProduct = {
          id: normalizeShoplineResourceId(node.id) || node.id,
          title: node.title ?? null,
          status: node.status ?? null,
          published: node.status ? node.status.toLowerCase() === 'active' : null,
          tags,
          templatePath: null,
          productType: node.product_type ?? node.productType ?? null,
          variants,
          raw: node,
        };
        return product;
      })
      .filter((p): p is ShoplineProduct => Boolean(p));

    return {
      products,
      nextPageInfo: pageInfo?.hasNextPage && pageInfo.endCursor
        ? pageInfo.endCursor
        : null,
      traceId: gqlResponse.traceId,
    };
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

    const limit = Math.min(options.limit || 250, 250);
    const query = new URLSearchParams({ limit: String(limit), collection_id: normalizedCollectionId });
    if (options.pageInfo) query.set('page_info', options.pageInfo);

    // Filter by collection: /products/products.json?collection_id=<id>&limit=250
    const response = await this.request<unknown>(
      shop,
      accessToken,
      `/products/products.json?${query.toString()}`,
    );

    const products = extractProductRecords(response.data)
      .map(mapProductRecord)
      .filter((product): product is ShoplineProduct => Boolean(product));

    return {
      products,
      nextPageInfo: response.nextPageInfo,
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
    const limit = Math.min(options.limit || 250, 250);
    const restQuery = new URLSearchParams({ limit: String(limit) });
    if (options.pageInfo) restQuery.set('page_info', options.pageInfo);

    // Correct path mirrors the products endpoint pattern: /products/collections/collections.json
    // Fallback candidates tried in order if primary returns non-200.
    const candidatePaths = [
      `/products/collections/collections.json?${restQuery.toString()}`,
      `/products/collections.json?${restQuery.toString()}`,
      `/products/categories/list.json?${restQuery.toString()}`,
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

      return {
        collections,
        nextPageInfo: response.nextPageInfo,
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
