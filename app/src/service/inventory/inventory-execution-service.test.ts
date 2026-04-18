import assert from 'node:assert/strict';
import test from 'node:test';
import { OrderPaidWebhookPayload } from '../../domain/blind-box/order-paid';
import { createBlindBoxTestContext, TestInventoryGateway } from '../../test-utils/blind-box-test-context';
import { resetRuntimeConfigForTests } from '../../lib/config';

function buildPaidOrderPayload(): OrderPaidWebhookPayload {
  return {
    id: 'order-2001',
    line_items: [
      {
        id: 'line-1',
        product_id: 'product-1',
        variant_id: 'variant-1',
        quantity: 1,
        title: 'Blind Box Product',
      },
    ],
  };
}

function buildHeaders(eventId: string): Record<string, string> {
  return {
    'x-shopline-shop-domain': 'blind-box.myshopline.com',
    'x-shopline-webhook-id': eventId,
  };
}

async function seedInventoryExecutionContext(
  inventoryExecutionMode: 'deferred' | 'execute',
  inventoryGateway = new TestInventoryGateway(),
  options: {
    configuredScopes?: string[];
    configuredLocationId?: string | null;
  } = {},
) {
  const context = await createBlindBoxTestContext({
    random: () => 0.1,
    inventoryExecutionMode,
    inventoryGateway,
    configuredScopes: options.configuredScopes,
    configuredLocationId: options.configuredLocationId,
  });

  const blindBox = await context.blindBoxService.createBlindBox('blind-box', {
    name: 'Inventory Box',
    status: 'active',
    selectionStrategy: 'uniform',
  });

  const poolItem = await context.blindBoxPoolItemService.upsertPoolItem('blind-box', {
    blindBoxId: blindBox.id,
    label: 'Prize A',
    sourceProductId: 'gid://shopline/Product/1001',
    sourceVariantId: 'gid://shopline/ProductVariant/2001',
    inventoryQuantity: 5,
    weight: 1,
    enabled: true,
  });

  await context.blindBoxProductMappingService.upsertProductMapping('blind-box', {
    blindBoxId: blindBox.id,
    productId: 'product-1',
    productVariantId: null,
    enabled: true,
  });

  return {
    context,
    blindBox,
    poolItem,
    inventoryGateway,
  };
}

test('inventory execution succeeds after immutable assignment persistence', async () => {
  const gateway = new TestInventoryGateway();
  const { context, blindBox } = await seedInventoryExecutionContext('execute', gateway);

  const result = await context.paidOrderWebhookService.processPaidOrderWebhook(
    buildHeaders('inventory-success'),
    buildPaidOrderPayload(),
  );

  const assignments = await context.blindBoxAssignmentService.listAssignments('blind-box');
  const inventoryOperations = await context.inventoryOperationService.listInventoryOperations('blind-box');
  const webhookEvents = await context.webhookEventService.listWebhookEvents('blind-box', {
    topic: 'orders/paid',
  });
  const poolItems = await context.blindBoxPoolItemService.listPoolItems('blind-box', blindBox.id);

  assert.equal(result.status, 'processed');
  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].status, 'inventory_committed');
  assert.equal(inventoryOperations.length, 1);
  assert.equal(inventoryOperations[0].status, 'succeeded');
  assert.equal(webhookEvents.length, 1);
  assert.equal(webhookEvents[0].status, 'processed');
  assert.equal(poolItems[0].inventoryQuantity, 4);
  assert.equal(gateway.commitRequests.length, 1);
});

test('inventory execution stays deferred when runtime mode is deferred', async () => {
  const gateway = new TestInventoryGateway();
  const { context, blindBox } = await seedInventoryExecutionContext('deferred', gateway);

  const result = await context.paidOrderWebhookService.processPaidOrderWebhook(
    buildHeaders('inventory-deferred'),
    buildPaidOrderPayload(),
  );

  const assignments = await context.blindBoxAssignmentService.listAssignments('blind-box');
  const inventoryOperations = await context.inventoryOperationService.listInventoryOperations('blind-box');
  const webhookEvents = await context.webhookEventService.listWebhookEvents('blind-box', {
    topic: 'orders/paid',
  });
  const poolItems = await context.blindBoxPoolItemService.listPoolItems('blind-box', blindBox.id);

  assert.equal(result.status, 'processed');
  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].status, 'inventory_pending');
  assert.equal(inventoryOperations.length, 1);
  assert.equal(inventoryOperations[0].status, 'pending');
  assert.equal(webhookEvents.length, 1);
  assert.equal(webhookEvents[0].status, 'processed');
  assert.equal(poolItems[0].inventoryQuantity, 5);
  assert.equal(gateway.commitRequests.length, 0);
});

test('retrying a failed inventory operation keeps the assignment immutable and recovers the workflow', async () => {
  const gateway = new TestInventoryGateway({
    commit: 'definitive',
  });
  const { context, blindBox } = await seedInventoryExecutionContext('execute', gateway);

  const firstWebhookResult = await context.paidOrderWebhookService.processPaidOrderWebhook(
    buildHeaders('inventory-retry'),
    buildPaidOrderPayload(),
  );
  const assignmentsAfterFailure = await context.blindBoxAssignmentService.listAssignments('blind-box');
  const inventoryOperationsAfterFailure = await context.inventoryOperationService.listInventoryOperations('blind-box');
  const poolItemsAfterFailure = await context.blindBoxPoolItemService.listPoolItems('blind-box', blindBox.id);
  const failedAssignment = assignmentsAfterFailure[0];
  const failedOperation = inventoryOperationsAfterFailure[0];

  gateway.setFailureMode({});

  const retryResult = await context.inventoryExecutionService.retryInventoryOperation(
    'blind-box',
    failedOperation.id,
  );

  const assignmentsAfterRetry = await context.blindBoxAssignmentService.listAssignments('blind-box');
  const inventoryOperationsAfterRetry = await context.inventoryOperationService.listInventoryOperations('blind-box');
  const webhookEvents = await context.webhookEventService.listWebhookEvents('blind-box', {
    topic: 'orders/paid',
  });
  const poolItemsAfterRetry = await context.blindBoxPoolItemService.listPoolItems('blind-box', blindBox.id);

  assert.equal(firstWebhookResult.status, 'failed');
  assert.equal(failedAssignment.status, 'inventory_failed');
  assert.equal(failedOperation.status, 'failed');
  assert.equal(poolItemsAfterFailure[0].inventoryQuantity, 5);

  assert.equal(retryResult.outcome, 'succeeded');
  assert.equal(retryResult.assignment.id, failedAssignment.id);
  assert.equal(retryResult.assignment.selectedPoolItemId, failedAssignment.selectedPoolItemId);
  assert.equal(retryResult.operation.id, failedOperation.id);
  assert.equal(retryResult.operation.status, 'succeeded');
  assert.equal(retryResult.operation.attemptCount, 2);
  assert.equal(assignmentsAfterRetry[0].id, failedAssignment.id);
  assert.equal(assignmentsAfterRetry[0].selectedPoolItemId, failedAssignment.selectedPoolItemId);
  assert.equal(assignmentsAfterRetry[0].status, 'inventory_committed');
  assert.equal(inventoryOperationsAfterRetry[0].status, 'succeeded');
  assert.equal(webhookEvents[0].status, 'failed');
  assert.equal(poolItemsAfterRetry[0].inventoryQuantity, 4);
});

test('duplicate retry attempts are a noop after the inventory operation already succeeded', async () => {
  const gateway = new TestInventoryGateway();
  const { context } = await seedInventoryExecutionContext('execute', gateway);

  await context.paidOrderWebhookService.processPaidOrderWebhook(
    buildHeaders('inventory-duplicate-retry'),
    buildPaidOrderPayload(),
  );

  const inventoryOperations = await context.inventoryOperationService.listInventoryOperations('blind-box');
  const firstRetryResult = await context.inventoryExecutionService.retryInventoryOperation(
    'blind-box',
    inventoryOperations[0].id,
  );
  const secondRetryResult = await context.inventoryExecutionService.retryInventoryOperation(
    'blind-box',
    inventoryOperations[0].id,
  );

  assert.equal(firstRetryResult.outcome, 'noop');
  assert.equal(secondRetryResult.outcome, 'noop');
  assert.equal(gateway.commitRequests.length, 1);
});

test('execute-mode readiness fails clearly when configured SHOPLINE scopes are missing', async () => {
  const gateway = new TestInventoryGateway();
  const { context } = await seedInventoryExecutionContext('execute', gateway, {
    configuredScopes: ['write_products'],
  });

  const result = await context.paidOrderWebhookService.processPaidOrderWebhook(
    buildHeaders('inventory-scope-missing'),
    buildPaidOrderPayload(),
  );

  const assignments = await context.blindBoxAssignmentService.listAssignments('blind-box');
  const inventoryOperations = await context.inventoryOperationService.listInventoryOperations('blind-box');

  assert.equal(result.status, 'failed');
  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].status, 'inventory_failed');
  assert.equal(inventoryOperations.length, 1);
  assert.equal(inventoryOperations[0].status, 'failed');
  assert.match(
    inventoryOperations[0].reason || '',
    /Configured SHOPLINE scopes are missing execute-mode requirements/i,
  );
  assert.equal(inventoryOperations[0].attemptCount, 1);
  assert.equal(gateway.validationRequests.length, 0);
  assert.equal(gateway.commitRequests.length, 0);
});

test('store validation reports missing location configuration clearly', async () => {
  const gateway = new TestInventoryGateway({
    validationError: {
      code: 'SHOPLINE_LOCATION_UNRESOLVED',
      message:
        'Unable to resolve a unique SHOPLINE location id. Configure BLIND_BOX_SHOPLINE_LOCATION_ID for live inventory execution.',
    },
  });
  const { context, poolItem } = await seedInventoryExecutionContext('execute', gateway);

  const report = await context.inventoryExecutionReadinessService.validatePoolItemExecutionReadiness(
    'blind-box',
    poolItem.id,
  );

  assert.equal(report.status, 'not_ready');
  assert.equal(report.poolItemId, poolItem.id);
  assert.equal(report.issues[0].code, 'SHOPLINE_LOCATION_UNRESOLVED');
  assert.match(report.issues[0].message, /Configure BLIND_BOX_SHOPLINE_LOCATION_ID/i);
  assert.match(report.issues[0].fixRecommendation, /BLIND_BOX_SHOPLINE_LOCATION_ID/i);
});

test('store validation reports missing variant linkage clearly', async () => {
  const gateway = new TestInventoryGateway({
    validationError: {
      code: 'SHOPLINE_VARIANT_REQUIRED',
      message:
        'Pool item "pool-item" requires sourceVariantId because product "gid://shopline/Product/1001" has multiple variants',
    },
  });
  const { context, poolItem } = await seedInventoryExecutionContext('execute', gateway);

  const report = await context.inventoryExecutionReadinessService.validatePoolItemExecutionReadiness(
    'blind-box',
    poolItem.id,
  );

  assert.equal(report.status, 'not_ready');
  assert.equal(report.issues[0].code, 'SHOPLINE_VARIANT_REQUIRED');
  assert.match(report.issues[0].message, /requires sourceVariantId/i);
  assert.match(report.issues[0].fixRecommendation, /sourceVariantId/i);
});

test('store validation reports missing inventory level linkage clearly', async () => {
  const gateway = new TestInventoryGateway({
    validation: 'level_missing',
  });
  const { context, poolItem } = await seedInventoryExecutionContext('execute', gateway, {
    configuredLocationId: 'test-location-1',
  });

  const report = await context.inventoryExecutionReadinessService.validatePoolItemExecutionReadiness(
    'blind-box',
    poolItem.id,
  );

  assert.equal(report.status, 'not_ready');
  assert.equal(report.issues[0].code, 'SHOPLINE_INVENTORY_LEVEL_MISSING');
  assert.match(report.summary, /not linked to location/i);
});

test('store validation reports insufficient inventory at the execute-mode location clearly', async () => {
  const gateway = new TestInventoryGateway({
    validationError: {
      code: 'SHOPLINE_INVENTORY_INSUFFICIENT',
      message:
        'SHOPLINE inventory item "inventory-item-pool-item" only has 0 available at location "test-location-1", but blind-box execution requires 1',
    },
  });
  const { context, poolItem } = await seedInventoryExecutionContext('execute', gateway, {
    configuredLocationId: 'test-location-1',
  });

  const report = await context.inventoryExecutionReadinessService.validatePoolItemExecutionReadiness(
    'blind-box',
    poolItem.id,
  );

  assert.equal(report.status, 'not_ready');
  assert.equal(report.issues[0].code, 'SHOPLINE_INVENTORY_INSUFFICIENT');
  assert.match(report.summary, /only has 0 available/i);
  assert.match(report.issues[0].fixRecommendation, /Increase available stock/i);
});

test('execute-mode readiness report succeeds when connected-store requirements are satisfied', async () => {
  const gateway = new TestInventoryGateway();
  const { context, poolItem } = await seedInventoryExecutionContext('execute', gateway, {
    configuredLocationId: 'test-location-1',
  });

  const report = await context.inventoryExecutionReadinessService.validatePoolItemExecutionReadiness(
    'blind-box',
    poolItem.id,
  );

  assert.equal(report.status, 'ready');
  assert.equal(report.missingScopes.length, 0);
  assert.equal(report.identifiers?.inventoryItemId, `inventory-item-${poolItem.id}`);
  assert.equal(report.identifiers?.locationId, 'test-location-1');
  assert.equal(report.inventoryItem?.tracked, true);
  assert.equal(report.inventoryLevel?.locationId, 'test-location-1');
});

test('retry succeeds after execute-mode configuration is fixed', async () => {
  const gateway = new TestInventoryGateway();
  const { context } = await seedInventoryExecutionContext('execute', gateway, {
    configuredScopes: ['write_products'],
  });

  const firstWebhookResult = await context.paidOrderWebhookService.processPaidOrderWebhook(
    buildHeaders('inventory-config-fixed'),
    buildPaidOrderPayload(),
  );
  const failedOperations = await context.inventoryOperationService.listInventoryOperations('blind-box');

  process.env.SCOPES = [
    'write_products',
    'read_products',
    'read_inventory',
    'read_location',
    'write_inventory',
  ].join(',');
  resetRuntimeConfigForTests();

  const retryResult = await context.inventoryExecutionService.retryInventoryOperation(
    'blind-box',
    failedOperations[0].id,
  );
  const assignmentsAfterRetry = await context.blindBoxAssignmentService.listAssignments('blind-box');
  const operationsAfterRetry = await context.inventoryOperationService.listInventoryOperations('blind-box');

  assert.equal(firstWebhookResult.status, 'failed');
  assert.equal(retryResult.outcome, 'succeeded');
  assert.equal(assignmentsAfterRetry[0].status, 'inventory_committed');
  assert.equal(operationsAfterRetry[0].status, 'succeeded');
  assert.equal(operationsAfterRetry[0].attemptCount, 2);
  assert.equal(gateway.commitRequests.length, 1);
});
