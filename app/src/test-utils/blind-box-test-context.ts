import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { initializeBlindBoxPersistence, resetBlindBoxDatabaseForTests } from '../db/client';
import { resetRuntimeConfigForTests } from '../lib/config';
import { BlindBoxService } from '../service/blind-box/blind-box-service';
import { BlindBoxRewardGroupLinkService } from '../service/blind-box/blind-box-reward-group-link-service';
import { BlindBoxPoolItemService } from '../service/blind-box/pool-item-service';
import { BlindBoxProductMappingService } from '../service/blind-box/product-mapping-service';
import { RewardGroupService } from '../service/blind-box/reward-group-service';
import { RewardCandidateService } from '../service/blind-box/reward-candidate-service';
import { BlindBoxAssignmentService } from '../service/blind-box/assignment-service';
import { InventoryOperationService } from '../service/inventory/inventory-operation-service';
import { InventoryExecutionService } from '../service/inventory/inventory-execution-service';
import { AssignmentInventoryBoundaryService } from '../service/inventory/assignment-inventory-boundary-service';
import { InventoryExecutionReadinessService } from '../service/inventory/inventory-execution-readiness-service';
import { WebhookEventService } from '../service/webhook/webhook-event-service';
import { PaidOrderAssignmentService } from '../service/blind-box/paid-order-assignment-service';
import { PaidOrderWebhookService } from '../service/webhook/paid-order-webhook-service';
import { BlindBoxActivationReadinessService } from '../service/blind-box/blind-box-activation-readiness-service';
import { BlindBoxDiscoveryService } from '../service/blind-box/blind-box-discovery-service';
import { SqliteBlindBoxRewardGroupLinkRepository } from '../repository/blind-box-reward-group-link-repository';
import { SqliteBlindBoxRepository } from '../repository/blind-box-repository';
import { SqliteBlindBoxPoolItemRepository } from '../repository/blind-box-pool-item-repository';
import { SqliteBlindBoxProductMappingRepository } from '../repository/blind-box-product-mapping-repository';
import { SqliteBlindBoxAssignmentRepository } from '../repository/blind-box-assignment-repository';
import { SqliteAssignmentInventoryBoundaryRepository } from '../repository/assignment-inventory-boundary-repository';
import { SqliteInventoryOperationRepository } from '../repository/inventory-operation-repository';
import { SqliteInventoryExecutionRepository } from '../repository/inventory-execution-repository';
import { SqliteRewardGroupRepository } from '../repository/reward-group-repository';
import { SqliteWebhookEventRepository } from '../repository/webhook-event-repository';
import { getBlindBoxDatabase } from '../db/client';
import { Logger } from '../lib/logger';
import {
  InventoryAdjustmentRequest,
  InventoryExecutionReadinessSnapshot,
  InventoryAdjustmentResult,
  InventoryGateway,
  InventoryGatewayError,
} from '../integration/shopline/inventory-gateway';
import {
  CatalogGatewayError,
  ShoplineCollection,
  ShoplineProduct,
} from '../integration/shopline/catalog-gateway';
import type { ShopAdminAccessTokenProvider } from '../lib/shop-admin-access-token';

export interface TestInventoryGatewayFailureMode {
  commit?: 'definitive' | 'indeterminate';
  validation?: 'definitive' | 'indeterminate' | 'not_tracked' | 'level_missing';
  validationError?: {
    code: string;
    message: string;
    disposition?: 'definitive' | 'indeterminate';
  };
}

export class TestInventoryGateway implements InventoryGateway {
  readonly commitRequests: InventoryAdjustmentRequest[] = [];
  readonly validationRequests: InventoryAdjustmentRequest[] = [];

  constructor(private failureMode: TestInventoryGatewayFailureMode = {}) {}

  setFailureMode(nextFailureMode: TestInventoryGatewayFailureMode): void {
    this.failureMode = nextFailureMode;
  }

  async reserve(): Promise<InventoryAdjustmentResult> {
    throw new InventoryGatewayError('Reserve is not implemented in tests', {
      code: 'TEST_RESERVE_NOT_IMPLEMENTED',
      disposition: 'definitive',
    });
  }

  async commit(request: InventoryAdjustmentRequest): Promise<InventoryAdjustmentResult> {
    this.commitRequests.push(request);

    if (this.failureMode.commit === 'definitive') {
      throw new InventoryGatewayError('Simulated inventory commit failure', {
        code: 'TEST_COMMIT_FAILURE',
        disposition: 'definitive',
      });
    }

    if (this.failureMode.commit === 'indeterminate') {
      throw new InventoryGatewayError('Simulated inventory commit timeout', {
        code: 'TEST_COMMIT_TIMEOUT',
        disposition: 'indeterminate',
      });
    }

    return {
      inventoryItemId: `inventory-item-${request.poolItemId}`,
      locationId: 'test-location-1',
      variantId: request.sourceVariantId || null,
      adjustedDelta: -Math.abs(request.quantity),
      traceId: `trace-${request.idempotencyKey}`,
      rawResponse: {
        ok: true,
      },
    };
  }

  async release(request: InventoryAdjustmentRequest): Promise<InventoryAdjustmentResult> {
    return {
      inventoryItemId: `inventory-item-${request.poolItemId}`,
      locationId: 'test-location-1',
      variantId: request.sourceVariantId || null,
      adjustedDelta: Math.abs(request.quantity),
      traceId: `trace-release-${request.idempotencyKey}`,
      rawResponse: {
        ok: true,
      },
    };
  }

  async validateExecutionReadiness(
    request: InventoryAdjustmentRequest,
  ): Promise<InventoryExecutionReadinessSnapshot> {
    this.validationRequests.push(request);

    if (this.failureMode.validationError) {
      throw new InventoryGatewayError(this.failureMode.validationError.message, {
        code: this.failureMode.validationError.code,
        disposition: this.failureMode.validationError.disposition || 'definitive',
      });
    }

    if (this.failureMode.validation === 'definitive') {
      throw new InventoryGatewayError('Simulated inventory readiness validation failure', {
        code: 'TEST_VALIDATION_FAILURE',
        disposition: 'definitive',
      });
    }

    if (this.failureMode.validation === 'indeterminate') {
      throw new InventoryGatewayError('Simulated inventory readiness timeout', {
        code: 'TEST_VALIDATION_TIMEOUT',
        disposition: 'indeterminate',
      });
    }

    if (this.failureMode.validation === 'not_tracked') {
      throw new InventoryGatewayError(
        `SHOPLINE inventory item "inventory-item-${request.poolItemId}" is not tracked and cannot be used for blind-box execute mode`,
        {
          code: 'SHOPLINE_INVENTORY_NOT_TRACKED',
          disposition: 'definitive',
        },
      );
    }

    if (this.failureMode.validation === 'level_missing') {
      throw new InventoryGatewayError(
        `SHOPLINE inventory item "inventory-item-${request.poolItemId}" is not linked to location "test-location-1"`,
        {
          code: 'SHOPLINE_INVENTORY_LEVEL_MISSING',
          disposition: 'definitive',
        },
      );
    }

    return {
      identifiers: {
        assignmentSourceProductId: request.sourceProductId || null,
        assignmentSourceVariantId: request.sourceVariantId || null,
        normalizedSourceProductId: request.sourceProductId || null,
        normalizedSourceVariantId: request.sourceVariantId || null,
        resolvedVariantId: request.sourceVariantId || null,
        inventoryItemId: `inventory-item-${request.poolItemId}`,
        locationId: request.preferredLocationId || 'test-location-1',
        locationResolution: request.preferredLocationId ? 'configured' : 'single_active',
      },
      inventoryItem: {
        id: `inventory-item-${request.poolItemId}`,
        variantId: request.sourceVariantId || null,
        tracked: true,
        requiredShipping: true,
        sku: `sku-${request.poolItemId}`,
      },
      inventoryLevel: {
        inventoryItemId: `inventory-item-${request.poolItemId}`,
        locationId: request.preferredLocationId || 'test-location-1',
        variantId: request.sourceVariantId || null,
        available: 10,
        updatedAt: new Date().toISOString(),
      },
      traceIds: [`trace-validate-${request.idempotencyKey}`],
    };
  }
}

class TestAccessTokenProvider implements ShopAdminAccessTokenProvider {
  async getAccessToken(): Promise<string> {
    return 'test-admin-access-token';
  }
}

class TestCatalogService {
  private readonly productsById = new Map<string, ShoplineProduct>();
  private readonly collectionsById = new Map<string, ShoplineCollection>();
  private readonly collectionsByHandle = new Map<string, ShoplineCollection>();
  private readonly collectionProductsById = new Map<string, ShoplineProduct[]>();

  setProduct(product: ShoplineProduct): void {
    this.productsById.set(product.id, product);
  }

  setCollection(collection: ShoplineCollection, products: ShoplineProduct[] = []): void {
    this.collectionsById.set(collection.id, collection);
    if (collection.handle) {
      this.collectionsByHandle.set(collection.handle, collection);
    }
    this.collectionProductsById.set(collection.id, products);
    for (const product of products) {
      this.setProduct(product);
    }
  }

  async getProduct(_shop: string, productId: string): Promise<ShoplineProduct> {
    const product = this.productsById.get(productId);
    if (!product) {
      throw new Error(`Test catalog product "${productId}" not found`);
    }

    return product;
  }

  async getCollection(_shop: string, collectionId: string): Promise<ShoplineCollection> {
    const collection = this.collectionsById.get(collectionId);
    if (!collection) {
      throw new Error(`Test collection "${collectionId}" not found`);
    }

    return collection;
  }

  async getCollectionByHandle(_shop: string, handle: string): Promise<ShoplineCollection> {
    const collection = this.collectionsByHandle.get(handle);
    if (!collection) {
      throw new CatalogGatewayError(`Test collection handle "${handle}" not found`, {
        code: 'SHOPLINE_COLLECTION_HANDLE_NOT_FOUND',
        statusCode: 404,
      });
    }

    return collection;
  }

  async listAllCollectionProducts(_shop: string, collectionId: string): Promise<{
    collection: ShoplineCollection;
    products: ShoplineProduct[];
    traceIds: string[];
  }> {
    return {
      collection: await this.getCollection(_shop, collectionId),
      products: [...(this.collectionProductsById.get(collectionId) || [])],
      traceIds: [`trace-collection-${collectionId}`],
    };
  }

  async listAllProducts(): Promise<{
    products: ShoplineProduct[];
    traceIds: string[];
  }> {
    return {
      products: [...this.productsById.values()],
      traceIds: ['trace-products'],
    };
  }
}

export interface BlindBoxTestContextOptions {
  random?: () => number;
  inventoryExecutionMode?: 'deferred' | 'execute';
  inventoryGateway?: InventoryGateway;
  configuredScopes?: string[];
  configuredLocationId?: string | null;
}

export async function createBlindBoxTestContext(options: BlindBoxTestContextOptions = {}) {
  await resetBlindBoxDatabaseForTests();

  const tempDirectory = mkdtempSync(join(tmpdir(), 'blind-box-tests-'));
  process.env.BLIND_BOX_DATABASE_PATH = join(tempDirectory, `${randomUUID()}.sqlite`);
  process.env.BLIND_BOX_INVENTORY_EXECUTION_MODE = options.inventoryExecutionMode || 'deferred';
  process.env.SCOPES = (options.configuredScopes || [
    'write_products',
    'read_products',
    'read_inventory',
    'read_location',
    'write_inventory',
  ]).join(',');
  process.env.BLIND_BOX_SHOPLINE_LOCATION_ID = options.configuredLocationId || '';
  resetRuntimeConfigForTests();

  await initializeBlindBoxPersistence();

  const db = await getBlindBoxDatabase();
  const inventoryGateway = options.inventoryGateway || new TestInventoryGateway();
  const blindBoxRepository = new SqliteBlindBoxRepository(db);
  const blindBoxPoolItemRepository = new SqliteBlindBoxPoolItemRepository(db);
  const blindBoxProductMappingRepository = new SqliteBlindBoxProductMappingRepository(db);
  const rewardGroupRepository = new SqliteRewardGroupRepository(db);
  const blindBoxRewardGroupLinkRepository = new SqliteBlindBoxRewardGroupLinkRepository(db);
  const blindBoxAssignmentRepository = new SqliteBlindBoxAssignmentRepository(db);
  const assignmentInventoryBoundaryRepository = new SqliteAssignmentInventoryBoundaryRepository(db);
  const inventoryOperationRepository = new SqliteInventoryOperationRepository(db);
  const inventoryExecutionRepository = new SqliteInventoryExecutionRepository(db);
  const webhookEventRepository = new SqliteWebhookEventRepository(db);

  const testCatalogService = new TestCatalogService();
  const blindBoxService = new BlindBoxService(blindBoxRepository);
  const rewardGroupService = new RewardGroupService(rewardGroupRepository);
  const blindBoxRewardGroupLinkService = new BlindBoxRewardGroupLinkService(blindBoxRewardGroupLinkRepository);
  const blindBoxPoolItemService = new BlindBoxPoolItemService(blindBoxPoolItemRepository);
  const blindBoxProductMappingService = new BlindBoxProductMappingService(blindBoxProductMappingRepository);
  const blindBoxAssignmentService = new BlindBoxAssignmentService(blindBoxAssignmentRepository);
  const inventoryOperationService = new InventoryOperationService(inventoryOperationRepository);
  const webhookEventService = new WebhookEventService(webhookEventRepository);
  const assignmentInventoryBoundaryService = new AssignmentInventoryBoundaryService({
    boundaryRepository: assignmentInventoryBoundaryRepository,
    assignmentRepository: blindBoxAssignmentRepository,
    inventoryOperationRepository,
    logger: new Logger({
      service: 'blind-box-test',
    }),
  });
  const inventoryExecutionReadinessService = new InventoryExecutionReadinessService({
    poolItemRepository: blindBoxPoolItemRepository,
    inventoryOperationRepository,
    inventoryGateway,
    accessTokenProvider: new TestAccessTokenProvider(),
    logger: new Logger({
      service: 'blind-box-test',
    }),
  });
  const inventoryExecutionService = new InventoryExecutionService({
    inventoryOperationService,
    inventoryOperationRepository,
    inventoryExecutionRepository,
    blindBoxAssignmentRepository,
    blindBoxPoolItemRepository,
    inventoryExecutionReadinessService,
    inventoryGateway,
    accessTokenProvider: new TestAccessTokenProvider(),
    logger: new Logger({
      service: 'blind-box-test',
    }),
  });
  const rewardCandidateService = new RewardCandidateService({
    blindBoxRepository,
    rewardGroupRepository,
    rewardGroupLinkRepository: blindBoxRewardGroupLinkRepository,
    catalogService: testCatalogService as unknown as any,
    inventoryGateway: inventoryGateway as any,
    accessTokenProvider: new TestAccessTokenProvider(),
    logger: new Logger({
      service: 'blind-box-test',
    }),
  });
  const blindBoxDiscoveryService = new BlindBoxDiscoveryService({
    blindBoxRepository,
    catalogService: testCatalogService as unknown as any,
    logger: new Logger({
      service: 'blind-box-test',
    }),
  });

  const paidOrderAssignmentService = new PaidOrderAssignmentService({
    blindBoxRepository,
    blindBoxPoolItemRepository,
    blindBoxProductMappingRepository,
    blindBoxAssignmentRepository,
    blindBoxDiscoveryService,
    catalogService: testCatalogService as unknown as any,
    rewardCandidateService,
    assignmentInventoryBoundaryService,
    inventoryExecutionService,
    logger: new Logger({
      service: 'blind-box-test',
    }),
    random: options.random || (() => 0.25),
    inventoryExecutionMode: options.inventoryExecutionMode || 'deferred',
  });

  const paidOrderWebhookService = new PaidOrderWebhookService({
    webhookEventService,
    paidOrderAssignmentService,
    logger: new Logger({
      service: 'blind-box-test',
    }),
  });
  const blindBoxActivationReadinessService = new BlindBoxActivationReadinessService({
    blindBoxRepository,
    rewardGroupRepository,
    rewardGroupLinkRepository: blindBoxRewardGroupLinkRepository,
    rewardCandidateService,
    catalogService: testCatalogService as unknown as any,
    poolItemRepository: blindBoxPoolItemRepository,
    productMappingRepository: blindBoxProductMappingRepository,
    inventoryExecutionReadinessService,
    logger: new Logger({
      service: 'blind-box-test',
    }),
  });

  return {
    blindBoxService,
    blindBoxActivationReadinessService,
    rewardGroupService,
    blindBoxRewardGroupLinkService,
    blindBoxPoolItemService,
    blindBoxProductMappingService,
    blindBoxAssignmentService,
    inventoryOperationService,
    inventoryExecutionReadinessService,
    inventoryExecutionService,
    webhookEventService,
    blindBoxDiscoveryService,
    rewardCandidateService,
    paidOrderAssignmentService,
    paidOrderWebhookService,
    testCatalogService,
  };
}
