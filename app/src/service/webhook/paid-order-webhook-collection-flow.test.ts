import assert from 'node:assert/strict';
import test from 'node:test';
import { ShoplineCollection, ShoplineProduct } from '../../integration/shopline/catalog-gateway';
import { OrderPaidWebhookPayload } from '../../domain/blind-box/order-paid';
import { createBlindBoxTestContext, TestInventoryGateway } from '../../test-utils/blind-box-test-context';

function buildCollection(id: string, title: string): ShoplineCollection {
  return {
    id,
    title,
    handle: title.toLowerCase().replace(/\s+/g, '-'),
    type: 'collection',
    status: 'active',
    raw: {},
  };
}

function buildProduct(
  id: string,
  title: string,
  variantId: string,
  inventoryQuantity: number,
): ShoplineProduct {
  return {
    id,
    title,
    status: 'active',
    published: true,
    variants: [
      {
        id: variantId,
        title: 'Default',
        sku: `sku-${variantId}`,
        inventoryQuantity,
        tracked: true,
        available: true,
        raw: {},
      },
    ],
    raw: {},
  };
}

function buildPaidOrderPayload(): OrderPaidWebhookPayload {
  return {
    id: 'order-3001',
    line_items: [
      {
        id: 'line-1',
        product_id: 'product-1',
        variant_id: 'variant-1',
        quantity: 1,
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

async function seedCollectionLinkedContext(
  inventoryExecutionMode: 'deferred' | 'execute' = 'deferred',
  inventoryGateway = new TestInventoryGateway(),
) {
  const context = await createBlindBoxTestContext({
    random: () => 0.1,
    inventoryExecutionMode,
    inventoryGateway,
  });
  const blindBox = await context.blindBoxService.createBlindBox('blind-box', {
    name: 'Collection Box',
    status: 'active',
    selectionStrategy: 'uniform',
    shoplineProductId: 'product-1',
    shoplineVariantId: 'variant-1',
  });
  const rewardGroup = await context.rewardGroupService.upsertRewardGroup('blind-box', {
    shoplineCollectionId: 'collection-1',
    status: 'active',
  });
  await context.blindBoxRewardGroupLinkService.upsertLink('blind-box', {
    blindBoxId: blindBox.id,
    rewardGroupId: rewardGroup.id,
  });

  context.testCatalogService.setProduct(
    buildProduct('product-1', 'Blind Box Product', 'variant-1', 50),
  );
  context.testCatalogService.setCollection(buildCollection('collection-1', 'Rewards'), [
    buildProduct('reward-1', 'Prize A', 'reward-1-v1', 8),
    buildProduct('reward-2', 'Prize B', 'reward-2-v1', 5),
  ]);

  return {
    context,
    blindBox,
  };
}

test('collection-linked paid-order processing persists a reward snapshot idempotently', async () => {
  const { context } = await seedCollectionLinkedContext();

  const firstPass = await context.paidOrderAssignmentService.processPaidOrder(
    'blind-box',
    buildPaidOrderPayload(),
  );
  const secondPass = await context.paidOrderAssignmentService.processPaidOrder(
    'blind-box',
    buildPaidOrderPayload(),
  );

  assert.equal(firstPass.assignments.length, 1);
  assert.equal(secondPass.assignments.length, 1);
  assert.equal(firstPass.assignments[0].selectedRewardProductId, 'reward-1');
  assert.equal(secondPass.assignments[0].selectedRewardProductId, 'reward-1');
  assert.equal(secondPass.assignments[0].wasExistingAssignment, true);
});

test('collection-linked paid-order webhook executes inventory and remains replay-safe', async () => {
  const gateway = new TestInventoryGateway();
  const { context } = await seedCollectionLinkedContext('execute', gateway);

  const firstResult = await context.paidOrderWebhookService.processPaidOrderWebhook(
    buildHeaders('collection-webhook-1'),
    buildPaidOrderPayload(),
  );
  const secondResult = await context.paidOrderWebhookService.processPaidOrderWebhook(
    buildHeaders('collection-webhook-1'),
    buildPaidOrderPayload(),
  );
  const assignments = await context.blindBoxAssignmentService.listAssignments('blind-box');
  const inventoryOperations = await context.inventoryOperationService.listInventoryOperations('blind-box');

  assert.equal(firstResult.status, 'processed');
  assert.equal(secondResult.status, 'duplicate');
  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].selectedRewardProductId, 'reward-1');
  assert.equal(assignments[0].status, 'inventory_committed');
  assert.equal(inventoryOperations.length, 1);
  assert.equal(inventoryOperations[0].rewardProductId, 'reward-1');
  assert.equal(gateway.commitRequests.length, 1);
});
