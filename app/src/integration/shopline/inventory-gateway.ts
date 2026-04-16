import fetch from 'node-fetch';
import { getRuntimeConfig } from '../../lib/config';

export type InventoryGatewayFailureDisposition = 'definitive' | 'indeterminate';

export interface InventoryAdjustmentRequest {
  shop: string;
  accessToken: string;
  poolItemId: string;
  sourceProductId?: string | null;
  sourceVariantId?: string | null;
  quantity: number;
  reason: string;
  idempotencyKey: string;
  preferredLocationId?: string | null;
}

export interface InventoryAdjustmentResult {
  inventoryItemId: string;
  locationId: string;
  variantId: string | null;
  adjustedDelta: number;
  traceId: string | null;
  rawResponse: unknown;
}

export type InventoryLocationResolution = 'configured' | 'default' | 'single_active';

export interface InventoryExecutionIdentifiers {
  assignmentSourceProductId: string | null;
  assignmentSourceVariantId: string | null;
  normalizedSourceProductId: string | null;
  normalizedSourceVariantId: string | null;
  resolvedVariantId: string | null;
  inventoryItemId: string;
  locationId: string;
  locationResolution: InventoryLocationResolution;
}

export interface InventoryItemState {
  id: string;
  variantId: string | null;
  tracked: boolean;
  requiredShipping: boolean | null;
  sku: string | null;
}

export interface InventoryLevelState {
  inventoryItemId: string;
  locationId: string;
  variantId: string | null;
  available: number | null;
  updatedAt: string | null;
}

export interface InventoryExecutionReadinessSnapshot {
  identifiers: InventoryExecutionIdentifiers;
  inventoryItem: InventoryItemState;
  inventoryLevel: InventoryLevelState;
  traceIds: string[];
}

export interface InventoryGatewayBoundaryDescription {
  provider: 'shopline_admin_openapi';
  commitPath: '/inventory_levels/adjust.json';
  variantLookupPath: '/products/variants/:id.json';
  productLookupPath: '/products/:id.json';
  inventoryItemLookupPath: '/inventory_items/:id.json';
  inventoryLevelLookupPath: '/inventory_levels.json';
  locationLookupPath: '/locations/list.json';
  assignmentBoundary: 'assignment_persisted_before_execution';
  sourceIdFormsAccepted: ['plain_id', 'gid'];
  platformIdempotency: 'not_assumed';
  liveMutationRequirements: string[];
}

export interface InventoryGateway {
  reserve(_request: InventoryAdjustmentRequest): Promise<InventoryAdjustmentResult>;
  commit(_request: InventoryAdjustmentRequest): Promise<InventoryAdjustmentResult>;
  release(_request: InventoryAdjustmentRequest): Promise<InventoryAdjustmentResult>;
  validateExecutionReadiness(
    _request: InventoryAdjustmentRequest,
  ): Promise<InventoryExecutionReadinessSnapshot>;
}

export interface InventoryDebugIssue {
  code: string;
  message: string;
}

export interface InventoryDebugLocation {
  id: string;
  name: string | null;
  active: boolean;
  isDefault: boolean;
}

export interface InventoryDebugProductVariant {
  variantId: string | null;
  title: string | null;
  sku: string | null;
  inventoryItemId: string | null;
  inventoryQuantity: number | null;
  tracked: boolean | null;
}

export interface InventoryDebugProduct {
  productId: string;
  normalizedProductId: string;
  title: string | null;
  variants: InventoryDebugProductVariant[];
  traceIds: string[];
}

export interface InventoryDebugInventoryLevel {
  inventoryItemId: string;
  locationId: string;
  variantId: string | null;
  available: number | null;
  updatedAt: string | null;
  isConfiguredLocation: boolean;
}

export interface InventoryDebugVariantInventory {
  variantId: string;
  normalizedVariantId: string;
  productId: string | null;
  inventoryItemId: string | null;
  tracked: boolean | null;
  requiredShipping: boolean | null;
  sku: string | null;
  configuredLocationId: string | null;
  executionLocationId: string | null;
  executionLocationResolution: InventoryLocationResolution | null;
  linkedLocationIds: string[];
  inventoryLevels: InventoryDebugInventoryLevel[];
  issues: InventoryDebugIssue[];
  traceIds: string[];
}

export interface InventoryDebugGateway {
  listLocations(_request: { shop: string; accessToken: string }): Promise<InventoryDebugLocation[]>;
  getProduct(_request: {
    shop: string;
    accessToken: string;
    productId: string;
  }): Promise<InventoryDebugProduct>;
  getVariantInventory(_request: {
    shop: string;
    accessToken: string;
    variantId: string;
    preferredLocationId?: string | null;
  }): Promise<InventoryDebugVariantInventory>;
}

export interface InventoryGatewayErrorOptions {
  code: string;
  disposition: InventoryGatewayFailureDisposition;
  details?: Record<string, unknown>;
}

export class InventoryGatewayError extends Error {
  readonly code: string;
  readonly disposition: InventoryGatewayFailureDisposition;
  readonly details?: Record<string, unknown>;

  constructor(message: string, options: InventoryGatewayErrorOptions) {
    super(message);
    this.name = 'InventoryGatewayError';
    this.code = options.code;
    this.disposition = options.disposition;
    this.details = options.details;
  }
}

export function getInventoryGatewayBoundaryDescription(): InventoryGatewayBoundaryDescription {
  return {
    provider: 'shopline_admin_openapi',
    commitPath: '/inventory_levels/adjust.json',
    variantLookupPath: '/products/variants/:id.json',
    productLookupPath: '/products/:id.json',
    inventoryItemLookupPath: '/inventory_items/:id.json',
    inventoryLevelLookupPath: '/inventory_levels.json',
    locationLookupPath: '/locations/list.json',
    assignmentBoundary: 'assignment_persisted_before_execution',
    sourceIdFormsAccepted: ['plain_id', 'gid'],
    platformIdempotency: 'not_assumed',
    liveMutationRequirements: [
      'An active SHOPLINE admin access token must be available for the shop',
      'Pool items must provide sourceProductId or sourceVariantId that can resolve to a live inventory item',
      'The resolved inventory item must be tracked and linked to the target location',
      'A verified active location must be resolvable for the store or configured explicitly',
      'The installed private app/store setup must include the SHOPLINE scopes required for product reads, inventory reads, location reads, and inventory adjustment',
    ],
  };
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
      if (normalizedValue === 'true' || normalizedValue === 'active' || normalizedValue === 'enabled') {
        return true;
      }

      if (normalizedValue === 'false' || normalizedValue === 'inactive' || normalizedValue === 'disabled') {
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

function extractVariantRecord(payload: unknown): Record<string, unknown> | null {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }

  return (
    asRecord(record.variant) ||
    asRecord(record.product_variant) ||
    asRecord(record.inventory_item_variant) ||
    asRecord(record.data)
  );
}

function extractLocationRecords(payload: unknown): Record<string, unknown>[] {
  const record = asRecord(payload);
  if (!record) {
    return [];
  }

  const directLocations =
    asRecordArray(record.locations) ||
    asRecordArray(record.location_list) ||
    asRecordArray(record.items);

  if (directLocations.length > 0) {
    return directLocations;
  }

  const dataRecord = asRecord(record.data);
  if (!dataRecord) {
    return [];
  }

  return (
    asRecordArray(dataRecord.locations) ||
    asRecordArray(dataRecord.location_list) ||
    asRecordArray(dataRecord.items)
  );
}

function extractInventoryItemRecord(payload: unknown): Record<string, unknown> | null {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }

  return asRecord(record.inventory_item) || asRecord(record.data) || asRecord(record.item);
}

function extractInventoryLevelRecords(payload: unknown): Record<string, unknown>[] {
  const record = asRecord(payload);
  if (!record) {
    return [];
  }

  const directLevels =
    asRecordArray(record.inventory_levels) ||
    asRecordArray(record.items) ||
    asRecordArray(record.data);

  if (directLevels.length > 0) {
    return directLevels;
  }

  const dataRecord = asRecord(record.data);
  if (!dataRecord) {
    return [];
  }

  return (
    asRecordArray(dataRecord.inventory_levels) ||
    asRecordArray(dataRecord.items)
  );
}

function extractProductVariantRecords(payload: unknown): Record<string, unknown>[] {
  const record = asRecord(payload);
  if (!record) {
    return [];
  }

  const productRecord = asRecord(record.product) || asRecord(record.data);
  if (!productRecord) {
    return [];
  }

  return (
    asRecordArray(productRecord.variants) ||
    asRecordArray(productRecord.product_variants) ||
    asRecordArray(productRecord.items)
  );
}

function extractProductRecord(payload: unknown): Record<string, unknown> | null {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }

  return asRecord(record.product) || asRecord(record.data) || record;
}

function isLocationActive(locationRecord: Record<string, unknown>): boolean {
  const activeValue = readBooleanField(locationRecord, ['active', 'enabled', 'is_active', 'is_enabled']);
  if (activeValue !== null) {
    return activeValue;
  }

  const statusValue = readStringField(locationRecord, ['status']);
  if (!statusValue) {
    return true;
  }

  return !['inactive', 'disabled', 'archived'].includes(statusValue.toLowerCase());
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

function pushTraceId(traceIds: string[], traceId: string | null): void {
  if (traceId) {
    traceIds.push(traceId);
  }
}

interface ShoplineInventoryGatewayOptions {
  apiVersion?: string;
  defaultLocationId?: string | null;
}

export class ShoplineInventoryGateway implements InventoryGateway, InventoryDebugGateway {
  private readonly apiVersion: string;
  private readonly defaultLocationId: string | null;

  constructor(options: ShoplineInventoryGatewayOptions = {}) {
    const runtimeConfig = getRuntimeConfig();

    this.apiVersion = options.apiVersion || runtimeConfig.shoplineAdminApiVersion;
    this.defaultLocationId =
      options.defaultLocationId === undefined
        ? runtimeConfig.blindBoxShoplineLocationId
        : options.defaultLocationId;
  }

  async reserve(): Promise<InventoryAdjustmentResult> {
    throw new InventoryGatewayError(
      'SHOPLINE reserve execution is not wired in this phase; commit is the live inventory path',
      {
        code: 'SHOPLINE_RESERVE_NOT_SUPPORTED',
        disposition: 'definitive',
      },
    );
  }

  async commit(request: InventoryAdjustmentRequest): Promise<InventoryAdjustmentResult> {
    return this.adjustInventoryLevel(request, -Math.abs(request.quantity));
  }

  async release(request: InventoryAdjustmentRequest): Promise<InventoryAdjustmentResult> {
    return this.adjustInventoryLevel(request, Math.abs(request.quantity));
  }

  async validateExecutionReadiness(
    request: InventoryAdjustmentRequest,
  ): Promise<InventoryExecutionReadinessSnapshot> {
    if (!request.accessToken) {
      throw new InventoryGatewayError('Missing SHOPLINE admin access token for inventory readiness validation', {
        code: 'SHOPLINE_ACCESS_TOKEN_MISSING',
        disposition: 'definitive',
      });
    }

    const traceIds: string[] = [];
    const identifiers = await this.resolveExecutionIdentifiers(request, traceIds);
    const inventoryItem = await this.fetchInventoryItemState(request, identifiers.inventoryItemId, traceIds);

    if (!inventoryItem.tracked) {
      throw new InventoryGatewayError(
        `SHOPLINE inventory item "${inventoryItem.id}" is not tracked and cannot be used for blind-box execute mode`,
        {
          code: 'SHOPLINE_INVENTORY_NOT_TRACKED',
          disposition: 'definitive',
          details: {
            inventoryItemId: inventoryItem.id,
            variantId: inventoryItem.variantId,
          },
        },
      );
    }

    const inventoryLevel = await this.fetchInventoryLevelState(
      request,
      identifiers.inventoryItemId,
      identifiers.locationId,
      traceIds,
    );

    return {
      identifiers,
      inventoryItem,
      inventoryLevel,
      traceIds,
    };
  }

  async listLocations(request: {
    shop: string;
    accessToken: string;
  }): Promise<InventoryDebugLocation[]> {
    if (!request.accessToken) {
      throw new InventoryGatewayError('Missing SHOPLINE admin access token for location inspection', {
        code: 'SHOPLINE_ACCESS_TOKEN_MISSING',
        disposition: 'definitive',
      });
    }

    const locationResponse = await this.request<unknown>(
      request.shop,
      request.accessToken,
      '/locations/list.json',
    );

    return extractLocationRecords(locationResponse.data).map((locationRecord) => ({
      id: readStringField(locationRecord, ['id', 'location_id']) || 'unknown',
      name: readStringField(locationRecord, ['name', 'location_name', 'display_name']),
      active: isLocationActive(locationRecord),
      isDefault: readBooleanField(locationRecord, ['default', 'is_default', 'primary']) === true,
    }));
  }

  async getProduct(request: {
    shop: string;
    accessToken: string;
    productId: string;
  }): Promise<InventoryDebugProduct> {
    if (!request.accessToken) {
      throw new InventoryGatewayError('Missing SHOPLINE admin access token for product inspection', {
        code: 'SHOPLINE_ACCESS_TOKEN_MISSING',
        disposition: 'definitive',
      });
    }

    const normalizedProductId = normalizeShoplineResourceId(request.productId);
    if (!normalizedProductId) {
      throw new InventoryGatewayError('A product id is required for SHOPLINE product inspection', {
        code: 'SHOPLINE_DEBUG_PRODUCT_ID_MISSING',
        disposition: 'definitive',
      });
    }

    const productResponse = await this.request<unknown>(
      request.shop,
      request.accessToken,
      `/products/${encodeURIComponent(normalizedProductId)}.json`,
    );
    const productRecord = extractProductRecord(productResponse.data);

    return {
      productId: readStringField(productRecord, ['id', 'product_id']) || normalizedProductId,
      normalizedProductId,
      title: readStringField(productRecord, ['title', 'name']),
      variants: extractProductVariantRecords(productResponse.data).map((variantRecord) => ({
        variantId: readStringField(variantRecord, ['id', 'variant_id']),
        title: readStringField(variantRecord, ['title', 'name']),
        sku: readStringField(variantRecord, ['sku']),
        inventoryItemId: readStringField(variantRecord, ['inventory_item_id', 'inventoryItemId']),
        inventoryQuantity: readNumberField(variantRecord, ['inventory_quantity', 'inventoryQuantity']),
        tracked: readBooleanField(variantRecord, ['tracked', 'inventory_tracked', 'inventoryTracked']),
      })),
      traceIds: productResponse.traceId ? [productResponse.traceId] : [],
    };
  }

  async getVariantInventory(request: {
    shop: string;
    accessToken: string;
    variantId: string;
    preferredLocationId?: string | null;
  }): Promise<InventoryDebugVariantInventory> {
    if (!request.accessToken) {
      throw new InventoryGatewayError('Missing SHOPLINE admin access token for variant inventory inspection', {
        code: 'SHOPLINE_ACCESS_TOKEN_MISSING',
        disposition: 'definitive',
      });
    }

    const normalizedVariantId = normalizeShoplineResourceId(request.variantId);
    if (!normalizedVariantId) {
      throw new InventoryGatewayError('A variant id is required for SHOPLINE variant inventory inspection', {
        code: 'SHOPLINE_DEBUG_VARIANT_ID_MISSING',
        disposition: 'definitive',
      });
    }

    const traceIds: string[] = [];
    const variantResponse = await this.request<unknown>(
      request.shop,
      request.accessToken,
      `/products/variants/${encodeURIComponent(normalizedVariantId)}.json`,
    );
    pushTraceId(traceIds, variantResponse.traceId);

    const variantRecord = extractVariantRecord(variantResponse.data);
    const inventoryItemId = readStringField(variantRecord, ['inventory_item_id', 'inventoryItemId']);
    const configuredLocationId = normalizeShoplineResourceId(request.preferredLocationId || this.defaultLocationId);
    const issues: InventoryDebugIssue[] = [];

    let executionLocationId: string | null = null;
    let executionLocationResolution: InventoryLocationResolution | null = null;

    try {
      const locationResolution = await this.resolveLocationId(
        {
          shop: request.shop,
          accessToken: request.accessToken,
          preferredLocationId: request.preferredLocationId,
        },
        traceIds,
      );
      executionLocationId = locationResolution.locationId;
      executionLocationResolution = locationResolution.resolution;
    } catch (error) {
      if (error instanceof InventoryGatewayError) {
        issues.push({
          code: error.code,
          message: error.message,
        });
      } else {
        throw error;
      }
    }

    if (!inventoryItemId) {
      issues.push({
        code: 'SHOPLINE_VARIANT_INVENTORY_ITEM_MISSING',
        message: `SHOPLINE variant "${normalizedVariantId}" does not expose an inventory item id`,
      });

      return {
        variantId: readStringField(variantRecord, ['id', 'variant_id']) || normalizedVariantId,
        normalizedVariantId,
        productId: readStringField(variantRecord, ['product_id', 'productId']),
        inventoryItemId: null,
        tracked: readBooleanField(variantRecord, ['tracked', 'inventory_tracked', 'inventoryTracked']),
        requiredShipping: null,
        sku: readStringField(variantRecord, ['sku']),
        configuredLocationId,
        executionLocationId,
        executionLocationResolution,
        linkedLocationIds: [],
        inventoryLevels: [],
        issues,
        traceIds,
      };
    }

    const inventoryItem = await this.fetchInventoryItemState(request, inventoryItemId, traceIds);
    const inventoryLevels = await this.fetchInventoryLevelStates(request, inventoryItemId, traceIds);

    if (inventoryLevels.length === 0) {
      issues.push({
        code: 'SHOPLINE_INVENTORY_LEVEL_MISSING',
        message: `SHOPLINE inventory item "${inventoryItemId}" is not linked to any visible location`,
      });
    }

    if (executionLocationId && !inventoryLevels.some((level) => level.locationId === executionLocationId)) {
      issues.push({
        code: 'SHOPLINE_CONFIGURED_LOCATION_NOT_LINKED',
        message: `SHOPLINE inventory item "${inventoryItemId}" is not linked to the execute-mode location "${executionLocationId}"`,
      });
    }

    return {
      variantId: readStringField(variantRecord, ['id', 'variant_id']) || normalizedVariantId,
      normalizedVariantId,
      productId: readStringField(variantRecord, ['product_id', 'productId']),
      inventoryItemId: inventoryItem.id,
      tracked: inventoryItem.tracked,
      requiredShipping: inventoryItem.requiredShipping,
      sku: inventoryItem.sku,
      configuredLocationId,
      executionLocationId,
      executionLocationResolution,
      linkedLocationIds: inventoryLevels.map((level) => level.locationId),
      inventoryLevels: inventoryLevels.map((level) => ({
        ...level,
        isConfiguredLocation: level.locationId === configuredLocationId,
      })),
      issues,
      traceIds,
    };
  }

  private async adjustInventoryLevel(
    request: InventoryAdjustmentRequest,
    adjustedDelta: number,
  ): Promise<InventoryAdjustmentResult> {
    if (!request.accessToken) {
      throw new InventoryGatewayError('Missing SHOPLINE admin access token for inventory execution', {
        code: 'SHOPLINE_ACCESS_TOKEN_MISSING',
        disposition: 'definitive',
      });
    }

    const variantDetails = await this.resolveVariantDetails(request);
    const locationDetails = await this.resolveLocationId(request);
    const { data, traceId } = await this.request<unknown>(request.shop, request.accessToken, '/inventory_levels/adjust.json', {
      method: 'POST',
      body: JSON.stringify({
        inventory_level: {
          inventory_item_id: variantDetails.inventoryItemId,
          location_id: locationDetails.locationId,
          available_adjustment: adjustedDelta,
        },
      }),
    });

    return {
      inventoryItemId: variantDetails.inventoryItemId,
      locationId: locationDetails.locationId,
      variantId: variantDetails.variantId,
      adjustedDelta,
      traceId,
      rawResponse: data,
    };
  }

  private async resolveExecutionIdentifiers(
    request: InventoryAdjustmentRequest,
    traceIds: string[] = [],
  ): Promise<InventoryExecutionIdentifiers> {
    const variantDetails = await this.resolveVariantDetails(request, traceIds);
    const locationDetails = await this.resolveLocationId(request, traceIds);

    return {
      assignmentSourceProductId: request.sourceProductId || null,
      assignmentSourceVariantId: request.sourceVariantId || null,
      normalizedSourceProductId: normalizeShoplineResourceId(request.sourceProductId),
      normalizedSourceVariantId: normalizeShoplineResourceId(request.sourceVariantId),
      resolvedVariantId: variantDetails.variantId,
      inventoryItemId: variantDetails.inventoryItemId,
      locationId: locationDetails.locationId,
      locationResolution: locationDetails.resolution,
    };
  }

  private async resolveVariantDetails(
    request: InventoryAdjustmentRequest,
    traceIds: string[] = [],
  ): Promise<{
    inventoryItemId: string;
    variantId: string | null;
  }> {
    const normalizedVariantId = normalizeShoplineResourceId(request.sourceVariantId);
    if (normalizedVariantId) {
      const variantResponse = await this.request<unknown>(
        request.shop,
        request.accessToken,
        `/products/variants/${encodeURIComponent(normalizedVariantId)}.json`,
      );
      pushTraceId(traceIds, variantResponse.traceId);

      const variantRecord = extractVariantRecord(variantResponse.data);
      const inventoryItemId = readStringField(variantRecord, ['inventory_item_id', 'inventoryItemId']);
      if (!inventoryItemId) {
        throw new InventoryGatewayError(
          `SHOPLINE variant "${request.sourceVariantId}" does not expose an inventory item id`,
          {
            code: 'SHOPLINE_VARIANT_INVENTORY_ITEM_MISSING',
            disposition: 'definitive',
          },
        );
      }

      return {
        inventoryItemId,
        variantId: readStringField(variantRecord, ['id', 'variant_id']) || normalizedVariantId,
      };
    }

    const normalizedProductId = normalizeShoplineResourceId(request.sourceProductId);
    if (!normalizedProductId) {
      throw new InventoryGatewayError(
        `Pool item "${request.poolItemId}" is missing sourceProductId/sourceVariantId required for live inventory execution`,
        {
          code: 'SHOPLINE_SOURCE_PRODUCT_MISSING',
          disposition: 'definitive',
        },
      );
    }

    const productResponse = await this.request<unknown>(
      request.shop,
      request.accessToken,
      `/products/${encodeURIComponent(normalizedProductId)}.json`,
    );
    pushTraceId(traceIds, productResponse.traceId);

    const variantRecords = extractProductVariantRecords(productResponse.data);
    if (variantRecords.length === 0) {
      throw new InventoryGatewayError(
        `SHOPLINE product "${request.sourceProductId}" has no variants available for inventory resolution`,
        {
          code: 'SHOPLINE_PRODUCT_VARIANT_MISSING',
          disposition: 'definitive',
        },
      );
    }

    if (variantRecords.length > 1) {
      throw new InventoryGatewayError(
        `Pool item "${request.poolItemId}" requires sourceVariantId because product "${request.sourceProductId}" has multiple variants`,
        {
          code: 'SHOPLINE_VARIANT_REQUIRED',
          disposition: 'definitive',
        },
      );
    }

    const variantRecord = variantRecords[0];
    const inventoryItemId = readStringField(variantRecord, ['inventory_item_id', 'inventoryItemId']);
    if (!inventoryItemId) {
      throw new InventoryGatewayError(
        `SHOPLINE product "${request.sourceProductId}" variant does not expose an inventory item id`,
        {
          code: 'SHOPLINE_VARIANT_INVENTORY_ITEM_MISSING',
          disposition: 'definitive',
        },
      );
    }

    return {
      inventoryItemId,
      variantId: readStringField(variantRecord, ['id', 'variant_id']),
    };
  }

  private async resolveLocationId(
    request: {
      shop: string;
      accessToken: string;
      preferredLocationId?: string | null;
    },
    traceIds: string[] = [],
  ): Promise<{
    locationId: string;
    resolution: InventoryLocationResolution;
  }> {
    const configuredLocationId = normalizeShoplineResourceId(
      request.preferredLocationId || this.defaultLocationId,
    );

    const locationResponse = await this.request<unknown>(
      request.shop,
      request.accessToken,
      '/locations/list.json',
    );
    pushTraceId(traceIds, locationResponse.traceId);
    const locationRecords = extractLocationRecords(locationResponse.data).filter(isLocationActive);

    if (configuredLocationId) {
      const configuredLocation = locationRecords.find((locationRecord) =>
        readStringField(locationRecord, ['id', 'location_id']) === configuredLocationId,
      );
      if (!configuredLocation) {
        throw new InventoryGatewayError(
          `Configured SHOPLINE location "${configuredLocationId}" was not found among active locations`,
          {
            code: 'SHOPLINE_LOCATION_CONFIGURED_NOT_FOUND',
            disposition: 'definitive',
            details: {
              configuredLocationId,
              activeLocationCount: locationRecords.length,
            },
          },
        );
      }

      return {
        locationId: configuredLocationId,
        resolution: 'configured',
      };
    }

    const defaultLocation = locationRecords.find((locationRecord) =>
      readBooleanField(locationRecord, ['default', 'is_default', 'primary']) === true,
    );
    if (defaultLocation) {
      const locationId = readStringField(defaultLocation, ['id', 'location_id']);
      if (locationId) {
        return {
          locationId,
          resolution: 'default',
        };
      }
    }

    if (locationRecords.length === 1) {
      const locationId = readStringField(locationRecords[0], ['id', 'location_id']);
      if (locationId) {
        return {
          locationId,
          resolution: 'single_active',
        };
      }
    }

    throw new InventoryGatewayError(
      'Unable to resolve a unique SHOPLINE location id. Configure BLIND_BOX_SHOPLINE_LOCATION_ID for live inventory execution.',
      {
        code: 'SHOPLINE_LOCATION_UNRESOLVED',
        disposition: 'definitive',
        details: {
          locationCount: locationRecords.length,
        },
      },
    );
  }

  private async fetchInventoryItemState(
    request: {
      shop: string;
      accessToken: string;
    },
    inventoryItemId: string,
    traceIds: string[],
  ): Promise<InventoryItemState> {
    const inventoryItemResponse = await this.request<unknown>(
      request.shop,
      request.accessToken,
      `/inventory_items/${encodeURIComponent(inventoryItemId)}.json`,
    );
    pushTraceId(traceIds, inventoryItemResponse.traceId);

    const inventoryItemRecord = extractInventoryItemRecord(inventoryItemResponse.data);
    const resolvedInventoryItemId =
      readStringField(inventoryItemRecord, ['id', 'inventory_item_id']) || inventoryItemId;
    const tracked = readBooleanField(inventoryItemRecord, ['tracked']);
    if (tracked === null) {
      throw new InventoryGatewayError(
        `SHOPLINE inventory item "${resolvedInventoryItemId}" does not expose whether inventory tracking is enabled`,
        {
          code: 'SHOPLINE_INVENTORY_TRACKING_STATE_MISSING',
          disposition: 'definitive',
        },
      );
    }

    return {
      id: resolvedInventoryItemId,
      variantId: readStringField(inventoryItemRecord, ['variant_id', 'variantId']),
      tracked,
      requiredShipping: readBooleanField(inventoryItemRecord, ['required_shipping', 'requiredShipping']),
      sku: readStringField(inventoryItemRecord, ['sku']),
    };
  }

  private async fetchInventoryLevelState(
    request: {
      shop: string;
      accessToken: string;
    },
    inventoryItemId: string,
    locationId: string,
    traceIds: string[],
  ): Promise<InventoryLevelState> {
    const queryParams = new URLSearchParams({
      inventory_item_ids: inventoryItemId,
      location_ids: locationId,
    });
    const inventoryLevelResponse = await this.request<unknown>(
      request.shop,
      request.accessToken,
      `/inventory_levels.json?${queryParams.toString()}`,
    );
    pushTraceId(traceIds, inventoryLevelResponse.traceId);

    const inventoryLevelRecord = extractInventoryLevelRecords(inventoryLevelResponse.data).find((record) => {
      const recordInventoryItemId = readStringField(record, ['inventory_item_id', 'inventoryItemId']);
      const recordLocationId = readStringField(record, ['location_id', 'locationId']);

      return recordInventoryItemId === inventoryItemId && recordLocationId === locationId;
    });

    if (!inventoryLevelRecord) {
      throw new InventoryGatewayError(
        `SHOPLINE inventory item "${inventoryItemId}" is not linked to location "${locationId}"`,
        {
          code: 'SHOPLINE_INVENTORY_LEVEL_MISSING',
          disposition: 'definitive',
          details: {
            inventoryItemId,
            locationId,
          },
        },
      );
    }

    return {
      inventoryItemId,
      locationId,
      variantId: readStringField(inventoryLevelRecord, ['variant_id', 'variantId']),
      available: readNumberField(inventoryLevelRecord, ['available']),
      updatedAt: readStringField(inventoryLevelRecord, ['updated_at', 'updatedAt']),
    };
  }

  private async fetchInventoryLevelStates(
    request: {
      shop: string;
      accessToken: string;
    },
    inventoryItemId: string,
    traceIds: string[],
  ): Promise<Omit<InventoryDebugInventoryLevel, 'isConfiguredLocation'>[]> {
    const queryParams = new URLSearchParams({
      inventory_item_ids: inventoryItemId,
    });
    const inventoryLevelResponse = await this.request<unknown>(
      request.shop,
      request.accessToken,
      `/inventory_levels.json?${queryParams.toString()}`,
    );
    pushTraceId(traceIds, inventoryLevelResponse.traceId);

    return extractInventoryLevelRecords(inventoryLevelResponse.data)
      .filter((record) => readStringField(record, ['inventory_item_id', 'inventoryItemId']) === inventoryItemId)
      .map((record) => ({
        inventoryItemId,
        locationId: readStringField(record, ['location_id', 'locationId']) || 'unknown',
        variantId: readStringField(record, ['variant_id', 'variantId']),
        available: readNumberField(record, ['available']),
        updatedAt: readStringField(record, ['updated_at', 'updatedAt']),
      }));
  }

  private async request<T>(
    shop: string,
    accessToken: string,
    path: string,
    init?: {
      method?: string;
      body?: string;
    },
  ): Promise<{
    data: T;
    traceId: string | null;
  }> {
    const url = `https://${shop}.myshopline.com/admin/openapi/${this.apiVersion}${path}`;

    let response;
    try {
      response = await fetch(url, {
        method: init?.method || 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json; charset=utf-8',
          'User-Agent': 'blind-box-backend/inventory-gateway',
        },
        body: init?.body,
      });
    } catch (error) {
      throw new InventoryGatewayError(
        error instanceof Error ? error.message : 'SHOPLINE inventory request failed before a response was received',
        {
          code: 'SHOPLINE_INVENTORY_NETWORK_ERROR',
          disposition: 'indeterminate',
        },
      );
    }

    const traceId = response.headers.get('traceid')?.split(',')?.[0] || null;
    const responseText = await response.text();

    if (!response.ok) {
      throw new InventoryGatewayError(
        `SHOPLINE inventory request failed with ${response.status} ${response.statusText}`,
        {
          code: 'SHOPLINE_INVENTORY_HTTP_ERROR',
          disposition: 'definitive',
          details: {
            status: response.status,
            responseText,
            traceId,
          },
        },
      );
    }

    const data = responseText ? (JSON.parse(responseText) as T) : ({} as T);
    return {
      data,
      traceId,
    };
  }
}

export class UnimplementedInventoryGateway implements InventoryGateway, InventoryDebugGateway {
  async reserve(): Promise<InventoryAdjustmentResult> {
    throw new InventoryGatewayError('Inventory reserve flow is not implemented for this environment', {
      code: 'INVENTORY_RESERVE_UNIMPLEMENTED',
      disposition: 'definitive',
    });
  }

  async commit(): Promise<InventoryAdjustmentResult> {
    throw new InventoryGatewayError('Inventory commit flow is not implemented for this environment', {
      code: 'INVENTORY_COMMIT_UNIMPLEMENTED',
      disposition: 'definitive',
    });
  }

  async release(): Promise<InventoryAdjustmentResult> {
    throw new InventoryGatewayError('Inventory release flow is not implemented for this environment', {
      code: 'INVENTORY_RELEASE_UNIMPLEMENTED',
      disposition: 'definitive',
    });
  }

  async validateExecutionReadiness(): Promise<InventoryExecutionReadinessSnapshot> {
    throw new InventoryGatewayError('Inventory validation flow is not implemented for this environment', {
      code: 'INVENTORY_VALIDATION_UNIMPLEMENTED',
      disposition: 'definitive',
    });
  }

  async listLocations(): Promise<InventoryDebugLocation[]> {
    throw new InventoryGatewayError('Inventory location inspection is not implemented for this environment', {
      code: 'INVENTORY_DEBUG_LOCATIONS_UNIMPLEMENTED',
      disposition: 'definitive',
    });
  }

  async getProduct(): Promise<InventoryDebugProduct> {
    throw new InventoryGatewayError('Inventory product inspection is not implemented for this environment', {
      code: 'INVENTORY_DEBUG_PRODUCT_UNIMPLEMENTED',
      disposition: 'definitive',
    });
  }

  async getVariantInventory(): Promise<InventoryDebugVariantInventory> {
    throw new InventoryGatewayError(
      'Inventory variant inspection is not implemented for this environment',
      {
        code: 'INVENTORY_DEBUG_VARIANT_UNIMPLEMENTED',
        disposition: 'definitive',
      },
    );
  }
}
