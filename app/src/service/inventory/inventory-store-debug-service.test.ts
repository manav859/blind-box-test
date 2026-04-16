import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InventoryDebugGateway,
  InventoryDebugLocation,
  InventoryDebugProduct,
  InventoryDebugVariantInventory,
  InventoryGatewayError,
} from '../../integration/shopline/inventory-gateway';
import { resetRuntimeConfigForTests } from '../../lib/config';
import { AppError } from '../../lib/errors';
import { Logger } from '../../lib/logger';
import { InventoryStoreDebugService } from './inventory-store-debug-service';

class FakeAccessTokenProvider {
  calls: string[] = [];

  async getAccessToken(shop: string): Promise<string> {
    this.calls.push(shop);
    return `token-for-${shop}`;
  }
}

class FakeInventoryDebugGateway implements InventoryDebugGateway {
  lastListLocationsRequest: { shop: string; accessToken: string } | null = null;
  lastGetProductRequest: { shop: string; accessToken: string; productId: string } | null = null;
  lastGetVariantInventoryRequest:
    | { shop: string; accessToken: string; variantId: string; preferredLocationId?: string | null }
    | null = null;

  listLocationsResult: InventoryDebugLocation[] = [
    {
      id: 'loc-1',
      name: 'Main Warehouse',
      active: true,
      isDefault: true,
    },
  ];

  productResult: InventoryDebugProduct = {
    productId: 'prod-1',
    normalizedProductId: 'prod-1',
    title: 'Mystery Prize',
    variants: [
      {
        variantId: 'var-1',
        title: 'Default Title',
        sku: 'SKU-1',
        inventoryItemId: 'inv-1',
        inventoryQuantity: 9,
        tracked: true,
      },
    ],
    traceIds: ['trace-product'],
  };

  variantInventoryResult: InventoryDebugVariantInventory = {
    variantId: 'var-1',
    normalizedVariantId: 'var-1',
    productId: 'prod-1',
    inventoryItemId: 'inv-1',
    tracked: true,
    requiredShipping: true,
    sku: 'SKU-1',
    configuredLocationId: 'loc-1',
    executionLocationId: 'loc-1',
    executionLocationResolution: 'configured',
    linkedLocationIds: ['loc-1'],
    inventoryLevels: [
      {
        inventoryItemId: 'inv-1',
        locationId: 'loc-1',
        variantId: 'var-1',
        available: 9,
        updatedAt: '2026-04-13T00:00:00.000Z',
        isConfiguredLocation: true,
      },
    ],
    issues: [],
    traceIds: ['trace-variant'],
  };

  productError: Error | null = null;

  async listLocations(request: { shop: string; accessToken: string }): Promise<InventoryDebugLocation[]> {
    this.lastListLocationsRequest = request;
    return this.listLocationsResult;
  }

  async getProduct(request: {
    shop: string;
    accessToken: string;
    productId: string;
  }): Promise<InventoryDebugProduct> {
    this.lastGetProductRequest = request;
    if (this.productError) {
      throw this.productError;
    }

    return this.productResult;
  }

  async getVariantInventory(request: {
    shop: string;
    accessToken: string;
    variantId: string;
    preferredLocationId?: string | null;
  }): Promise<InventoryDebugVariantInventory> {
    this.lastGetVariantInventoryRequest = request;
    return this.variantInventoryResult;
  }
}

function createService(
  gateway = new FakeInventoryDebugGateway(),
  accessTokenProvider = new FakeAccessTokenProvider(),
) {
  return {
    gateway,
    accessTokenProvider,
    service: new InventoryStoreDebugService({
      inventoryDebugGateway: gateway,
      accessTokenProvider,
      logger: new Logger({
        service: 'blind-box-debug-test',
      }),
    }),
  };
}

test('debug locations use stored token fallback when the session token is absent', async () => {
  const { gateway, accessTokenProvider, service } = createService();

  const locations = await service.listLocations('blind-box');

  assert.equal(locations.length, 1);
  assert.equal(locations[0].id, 'loc-1');
  assert.equal(accessTokenProvider.calls.length, 1);
  assert.equal(accessTokenProvider.calls[0], 'blind-box');
  assert.equal(gateway.lastListLocationsRequest?.accessToken, 'token-for-blind-box');
});

test('debug product inspection returns variant inventory linkage fields', async () => {
  const { gateway, service } = createService();

  const product = await service.getProduct('blind-box', 'prod-1', {
    accessToken: 'session-token',
  });

  assert.equal(product.productId, 'prod-1');
  assert.equal(product.title, 'Mystery Prize');
  assert.equal(product.variants.length, 1);
  assert.equal(product.variants[0].variantId, 'var-1');
  assert.equal(product.variants[0].inventoryItemId, 'inv-1');
  assert.equal(gateway.lastGetProductRequest?.accessToken, 'session-token');
});

test('debug variant inspection uses the configured execute-mode location', async () => {
  process.env.BLIND_BOX_SHOPLINE_LOCATION_ID = 'loc-1';
  resetRuntimeConfigForTests();

  const { gateway, service } = createService();

  const variantInventory = await service.getVariantInventory('blind-box', 'var-1', {
    accessToken: 'session-token',
  });

  assert.equal(variantInventory.executionLocationId, 'loc-1');
  assert.equal(gateway.lastGetVariantInventoryRequest?.preferredLocationId, 'loc-1');
  assert.equal(variantInventory.inventoryLevels[0].isConfiguredLocation, true);
});

test('debug endpoints surface operator-readable SHOPLINE errors', async () => {
  const gateway = new FakeInventoryDebugGateway();
  gateway.productError = new InventoryGatewayError('SHOPLINE product was not found in the connected store', {
    code: 'SHOPLINE_INVENTORY_HTTP_ERROR',
    disposition: 'definitive',
    details: {
      status: 404,
    },
  });
  const { service } = createService(gateway);

  await assert.rejects(
    () => service.getProduct('blind-box', 'missing-product'),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'SHOPLINE_INVENTORY_HTTP_ERROR');
      assert.equal(error.statusCode, 404);
      assert.equal(error.message, 'SHOPLINE product was not found in the connected store');
      return true;
    },
  );
});
