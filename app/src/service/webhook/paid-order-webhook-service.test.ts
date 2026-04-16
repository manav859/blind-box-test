import assert from 'node:assert/strict';
import test from 'node:test';
import { createBlindBoxTestContext, TestInventoryGateway } from '../../test-utils/blind-box-test-context';
import { OrderPaidWebhookPayload } from '../../domain/blind-box/order-paid';

function buildPaidOrderPayload(): OrderPaidWebhookPayload {
  return {
    id: 'order-1001',
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

function buildMultiQuantityPaidOrderPayload(): OrderPaidWebhookPayload {
  return {
    id: 'order-1002',
    line_items: [
      {
        id: 'line-2',
        product_id: 'product-1',
        variant_id: 'variant-1',
        quantity: 2,
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

async function seedActiveBlindBoxContext(
  random?: () => number,
  inventoryExecutionMode: 'deferred' | 'execute' = 'deferred',
  inventoryGateway = new TestInventoryGateway(),
) {
  const context = await createBlindBoxTestContext({
    random,
    inventoryExecutionMode,
    inventoryGateway,
  });

  const blindBox = await context.blindBoxService.createBlindBox('blind-box', {
    name: 'Starter Box',
    status: 'active',
    selectionStrategy: 'weighted',
  });

  await context.blindBoxPoolItemService.upsertPoolItem('blind-box', {
    blindBoxId: blindBox.id,
    label: 'Prize A',
    weight: 1,
    inventoryQuantity: 5,
  });

  await context.blindBoxPoolItemService.upsertPoolItem('blind-box', {
    blindBoxId: blindBox.id,
    label: 'Prize B',
    weight: 4,
    inventoryQuantity: 3,
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
  };
}

test('paid-order webhook processing ignores duplicate processed events', async () => {
  const { context } = await seedActiveBlindBoxContext(() => 0.8);

  const firstResult = await context.paidOrderWebhookService.processPaidOrderWebhook(
    buildHeaders('webhook-1'),
    buildPaidOrderPayload(),
  );

  const secondResult = await context.paidOrderWebhookService.processPaidOrderWebhook(
    buildHeaders('webhook-1'),
    buildPaidOrderPayload(),
  );

  const assignments = await context.blindBoxAssignmentService.listAssignments('blind-box');

  assert.equal(firstResult.status, 'processed');
  assert.equal(secondResult.status, 'duplicate');
  assert.equal(assignments.length, 1);
});

test('paid-order processing keeps assignments immutable across repeated order-line processing', async () => {
  const { context } = await seedActiveBlindBoxContext(() => 0.99);

  const firstPass = await context.paidOrderAssignmentService.processPaidOrder('blind-box', buildPaidOrderPayload());
  const secondPass = await context.paidOrderAssignmentService.processPaidOrder('blind-box', buildPaidOrderPayload());

  assert.equal(firstPass.assignments.length, 1);
  assert.equal(secondPass.assignments.length, 1);
  assert.equal(firstPass.assignments[0].selectedPoolItemId, secondPass.assignments[0].selectedPoolItemId);
  assert.equal(secondPass.assignments[0].wasExistingAssignment, true);
});

test('paid-order processing fails clearly when no eligible item exists', async () => {
  const context = await createBlindBoxTestContext();

  const blindBox = await context.blindBoxService.createBlindBox('blind-box', {
    name: 'Unavailable Box',
    status: 'active',
    selectionStrategy: 'uniform',
  });

  await context.blindBoxPoolItemService.upsertPoolItem('blind-box', {
    blindBoxId: blindBox.id,
    label: 'Sold Out Prize',
    weight: 1,
    inventoryQuantity: 0,
  });

  await context.blindBoxProductMappingService.upsertProductMapping('blind-box', {
    blindBoxId: blindBox.id,
    productId: 'product-1',
    enabled: true,
  });

  const result = await context.paidOrderAssignmentService.processPaidOrder('blind-box', buildPaidOrderPayload());

  assert.equal(result.assignments.length, 0);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].reason, 'NO_ELIGIBLE_ITEMS');
});

test('paid-order processing rejects blind-box order lines with quantity greater than one', async () => {
  const { context } = await seedActiveBlindBoxContext(() => 0.25);

  const result = await context.paidOrderAssignmentService.processPaidOrder(
    'blind-box',
    buildMultiQuantityPaidOrderPayload(),
  );

  assert.equal(result.assignments.length, 0);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].reason, 'UNSUPPORTED_QUANTITY');
});

test('paid-order webhook processing records inventory workflow failures without rerolling assignment', async () => {
  const { context } = await seedActiveBlindBoxContext(
    () => 0.9,
    'execute',
    new TestInventoryGateway({
      commit: 'definitive',
    }),
  );

  const result = await context.paidOrderWebhookService.processPaidOrderWebhook(
    buildHeaders('webhook-inventory-failure'),
    buildPaidOrderPayload(),
  );

  const assignments = await context.blindBoxAssignmentService.listAssignments('blind-box');

  assert.equal(result.status, 'failed');
  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].status, 'inventory_failed');
});

test('paid-order webhook retries do not convert an existing inventory failure into a processed event', async () => {
  const { context } = await seedActiveBlindBoxContext(
    () => 0.9,
    'execute',
    new TestInventoryGateway({
      commit: 'definitive',
    }),
  );

  const firstResult = await context.paidOrderWebhookService.processPaidOrderWebhook(
    buildHeaders('webhook-retry-after-failure'),
    buildPaidOrderPayload(),
  );
  const secondResult = await context.paidOrderWebhookService.processPaidOrderWebhook(
    buildHeaders('webhook-retry-after-failure'),
    buildPaidOrderPayload(),
  );

  const assignments = await context.blindBoxAssignmentService.listAssignments('blind-box');
  const inventoryOperations = await context.inventoryOperationService.listInventoryOperations('blind-box');

  assert.equal(firstResult.status, 'failed');
  assert.equal(secondResult.status, 'failed');
  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].status, 'inventory_failed');
  assert.equal(inventoryOperations.length, 1);
  assert.equal(inventoryOperations[0].status, 'failed');
});

test('paid-order webhook replay marks the event processed after inventory recovery succeeds', async () => {
  const gateway = new TestInventoryGateway({
    commit: 'definitive',
  });
  const { context } = await seedActiveBlindBoxContext(() => 0.9, 'execute', gateway);

  const firstResult = await context.paidOrderWebhookService.processPaidOrderWebhook(
    buildHeaders('webhook-retry-after-recovery'),
    buildPaidOrderPayload(),
  );

  const inventoryOperations = await context.inventoryOperationService.listInventoryOperations('blind-box');
  assert.equal(firstResult.status, 'failed');
  assert.equal(inventoryOperations.length, 1);

  gateway.setFailureMode({});

  const retryResult = await context.inventoryExecutionService.retryInventoryOperation(
    'blind-box',
    inventoryOperations[0].id,
  );
  const replayResult = await context.paidOrderWebhookService.processPaidOrderWebhook(
    buildHeaders('webhook-retry-after-recovery'),
    buildPaidOrderPayload(),
  );
  const webhookEvents = await context.webhookEventService.listWebhookEvents('blind-box', {
    topic: 'orders/paid',
  });

  assert.equal(retryResult.outcome, 'succeeded');
  assert.equal(replayResult.status, 'processed');
  assert.equal(webhookEvents.length, 1);
  assert.equal(webhookEvents[0].status, 'processed');
});
