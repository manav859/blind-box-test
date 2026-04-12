import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { initializeBlindBoxPersistence, resetBlindBoxDatabaseForTests } from '../db/client';
import { resetRuntimeConfigForTests } from '../lib/config';
import { BlindBoxService } from '../service/blind-box/blind-box-service';
import { BlindBoxPoolItemService } from '../service/blind-box/pool-item-service';
import { BlindBoxProductMappingService } from '../service/blind-box/product-mapping-service';
import { BlindBoxAssignmentService } from '../service/blind-box/assignment-service';
import { InventoryOperationService } from '../service/inventory/inventory-operation-service';
import { WebhookEventService } from '../service/webhook/webhook-event-service';
import { PaidOrderAssignmentService } from '../service/blind-box/paid-order-assignment-service';
import { PaidOrderWebhookService } from '../service/webhook/paid-order-webhook-service';
import { SqliteBlindBoxRepository } from '../repository/blind-box-repository';
import { SqliteBlindBoxPoolItemRepository } from '../repository/blind-box-pool-item-repository';
import { SqliteBlindBoxProductMappingRepository } from '../repository/blind-box-product-mapping-repository';
import { SqliteBlindBoxAssignmentRepository } from '../repository/blind-box-assignment-repository';
import { SqliteInventoryOperationRepository } from '../repository/inventory-operation-repository';
import { SqliteWebhookEventRepository } from '../repository/webhook-event-repository';
import { getBlindBoxDatabase } from '../db/client';
import { Logger } from '../lib/logger';
import { InventoryGateway } from '../integration/shopline/inventory-gateway';

export interface TestInventoryGatewayFailureMode {
  commit?: boolean;
}

export class TestInventoryGateway implements InventoryGateway {
  constructor(private readonly failureMode: TestInventoryGatewayFailureMode = {}) {}

  async reserve(): Promise<void> {}

  async commit(): Promise<void> {
    if (this.failureMode.commit) {
      throw new Error('Simulated inventory commit failure');
    }
  }

  async release(): Promise<void> {}
}

export interface BlindBoxTestContextOptions {
  random?: () => number;
  inventoryExecutionMode?: 'deferred' | 'execute';
  inventoryGateway?: InventoryGateway;
}

export async function createBlindBoxTestContext(options: BlindBoxTestContextOptions = {}) {
  await resetBlindBoxDatabaseForTests();

  const tempDirectory = mkdtempSync(join(tmpdir(), 'blind-box-tests-'));
  process.env.BLIND_BOX_DATABASE_PATH = join(tempDirectory, `${randomUUID()}.sqlite`);
  process.env.BLIND_BOX_INVENTORY_EXECUTION_MODE = options.inventoryExecutionMode || 'deferred';
  resetRuntimeConfigForTests();

  await initializeBlindBoxPersistence();

  const db = await getBlindBoxDatabase();
  const blindBoxRepository = new SqliteBlindBoxRepository(db);
  const blindBoxPoolItemRepository = new SqliteBlindBoxPoolItemRepository(db);
  const blindBoxProductMappingRepository = new SqliteBlindBoxProductMappingRepository(db);
  const blindBoxAssignmentRepository = new SqliteBlindBoxAssignmentRepository(db);
  const inventoryOperationRepository = new SqliteInventoryOperationRepository(db);
  const webhookEventRepository = new SqliteWebhookEventRepository(db);

  const blindBoxService = new BlindBoxService(blindBoxRepository);
  const blindBoxPoolItemService = new BlindBoxPoolItemService(blindBoxPoolItemRepository);
  const blindBoxProductMappingService = new BlindBoxProductMappingService(blindBoxProductMappingRepository);
  const blindBoxAssignmentService = new BlindBoxAssignmentService(blindBoxAssignmentRepository);
  const inventoryOperationService = new InventoryOperationService(inventoryOperationRepository);
  const webhookEventService = new WebhookEventService(webhookEventRepository);

  const paidOrderAssignmentService = new PaidOrderAssignmentService({
    blindBoxRepository,
    blindBoxPoolItemRepository,
    blindBoxProductMappingRepository,
    blindBoxAssignmentRepository,
    blindBoxAssignmentService,
    inventoryOperationService,
    inventoryGateway: options.inventoryGateway || new TestInventoryGateway(),
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

  return {
    blindBoxService,
    blindBoxPoolItemService,
    blindBoxProductMappingService,
    blindBoxAssignmentService,
    inventoryOperationService,
    webhookEventService,
    paidOrderAssignmentService,
    paidOrderWebhookService,
  };
}
