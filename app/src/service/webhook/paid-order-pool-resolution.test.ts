import assert from 'node:assert/strict';
import test from 'node:test';
import { ShoplineProduct } from '../../integration/shopline/catalog-gateway';
import { OrderPaidWebhookPayload } from '../../domain/blind-box/order-paid';
import { createBlindBoxTestContext, TestInventoryGateway } from '../../test-utils/blind-box-test-context';

function buildProduct(id: string, title: string, variantId: string, stock: number): ShoplineProduct {
  return {
    id,
    title,
    status: 'active',
    published: true,
    imageUrl: null,
    variants: [
      { id: variantId, title: 'Default', sku: `sku-${variantId}`, inventoryQuantity: stock, tracked: true, available: stock > 0, raw: {} },
    ],
    raw: {},
  };
}

function buildPaidOrderPayload(orderId = 'order-5001'): OrderPaidWebhookPayload {
  return {
    id: orderId,
    name: '#5001',
    customer: { first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' },
    line_items: [{ id: 'line-1', product_id: 'trigger-1', variant_id: 'tv-1', quantity: 1, title: 'Mystery Box' }],
  };
}

async function seedActiveBox(
  context: Awaited<ReturnType<typeof createBlindBoxTestContext>>,
  rewards: Array<{ productId: string; variantId: string; title: string; stock: number }>,
) {
  context.testCatalogService.setProduct(buildProduct('trigger-1', 'Mystery Box', 'tv-1', 100));
  const blindBox = await context.blindBoxService.createBlindBox('blind-box', {
    name: 'Mystery Box',
    status: 'active',
    triggerProductId: 'trigger-1',
    triggerProductTitleSnapshot: 'Mystery Box',
  });
  for (const reward of rewards) {
    context.testCatalogService.setProduct(buildProduct(reward.productId, reward.title, reward.variantId, reward.stock));
    await context.blindBoxPoolItemService.addReward('blind-box', {
      blindBoxId: blindBox.id,
      rewardProductId: reward.productId,
      rewardVariantId: reward.variantId,
      rewardTitleSnapshot: reward.title,
    });
  }
  return blindBox;
}

test('paid order matches by trigger product and assigns a reward from the pool', async () => {
  const context = await createBlindBoxTestContext({ random: () => 0.5 });
  await seedActiveBox(context, [{ productId: 'reward-1', variantId: 'r1v1', title: 'Prize A', stock: 5 }]);

  const result = await context.paidOrderAssignmentService.processPaidOrder('blind-box', buildPaidOrderPayload());

  assert.equal(result.assignments.length, 1);
  assert.equal(result.failures.length, 0);
  assert.equal(result.assignments[0].selectedRewardProductId, 'reward-1');
});

test('selection is weighted by live inventory (higher stock wins for a mid-range roll)', async () => {
  // Pool order is created_at DESC → [reward-2 (stock 9), reward-1 (stock 1)], total 10.
  // random=0.5 → threshold 5 → minus 9 < 0 → reward-2 (the high-stock item).
  const context = await createBlindBoxTestContext({ random: () => 0.5 });
  await seedActiveBox(context, [
    { productId: 'reward-1', variantId: 'r1v1', title: 'Rare', stock: 1 },
    { productId: 'reward-2', variantId: 'r2v1', title: 'Common', stock: 9 },
  ]);

  const result = await context.paidOrderAssignmentService.processPaidOrder('blind-box', buildPaidOrderPayload());

  assert.equal(result.assignments.length, 1);
  assert.equal(result.assignments[0].selectedRewardProductId, 'reward-2');
});

test('selection can land on the low-stock item for a tail roll', async () => {
  // random=0.99 → threshold 9.9 → minus 9 = 0.9 → minus 1 < 0 → reward-1 (low stock).
  const context = await createBlindBoxTestContext({ random: () => 0.99 });
  await seedActiveBox(context, [
    { productId: 'reward-1', variantId: 'r1v1', title: 'Rare', stock: 1 },
    { productId: 'reward-2', variantId: 'r2v1', title: 'Common', stock: 9 },
  ]);

  const result = await context.paidOrderAssignmentService.processPaidOrder('blind-box', buildPaidOrderPayload());

  assert.equal(result.assignments[0].selectedRewardProductId, 'reward-1');
});

test('all rewards out of stock → REWARD_POOL_OUT_OF_STOCK failure, no crash', async () => {
  const context = await createBlindBoxTestContext({ random: () => 0.5 });
  await seedActiveBox(context, [
    { productId: 'reward-1', variantId: 'r1v1', title: 'Sold Out A', stock: 0 },
    { productId: 'reward-2', variantId: 'r2v1', title: 'Sold Out B', stock: 0 },
  ]);

  const result = await context.paidOrderAssignmentService.processPaidOrder('blind-box', buildPaidOrderPayload());

  assert.equal(result.assignments.length, 0);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].reason, 'REWARD_POOL_OUT_OF_STOCK');
});

test('empty pool → EMPTY_POOL failure', async () => {
  const context = await createBlindBoxTestContext({ random: () => 0.5 });
  await seedActiveBox(context, []);

  const result = await context.paidOrderAssignmentService.processPaidOrder('blind-box', buildPaidOrderPayload());

  assert.equal(result.assignments.length, 0);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].reason, 'EMPTY_POOL');
});

test('resolution is idempotent on shop:order:line — never re-rolls', async () => {
  const context = await createBlindBoxTestContext({ random: () => 0.5 });
  await seedActiveBox(context, [
    { productId: 'reward-1', variantId: 'r1v1', title: 'Rare', stock: 1 },
    { productId: 'reward-2', variantId: 'r2v1', title: 'Common', stock: 9 },
  ]);

  const first = await context.paidOrderAssignmentService.processPaidOrder('blind-box', buildPaidOrderPayload());
  const second = await context.paidOrderAssignmentService.processPaidOrder('blind-box', buildPaidOrderPayload());
  const assignments = await context.blindBoxAssignmentService.listAssignments('blind-box');

  assert.equal(assignments.length, 1);
  assert.equal(first.assignments[0].selectedRewardProductId, second.assignments[0].selectedRewardProductId);
  assert.equal(second.assignments[0].wasExistingAssignment, true);
});

test('draft blind boxes never resolve (must be activated first)', async () => {
  const context = await createBlindBoxTestContext({ random: () => 0.5 });
  context.testCatalogService.setProduct(buildProduct('trigger-1', 'Mystery Box', 'tv-1', 100));
  const blindBox = await context.blindBoxService.createBlindBox('blind-box', {
    name: 'Draft Box',
    status: 'draft',
    triggerProductId: 'trigger-1',
  });
  context.testCatalogService.setProduct(buildProduct('reward-1', 'Prize A', 'r1v1', 5));
  await context.blindBoxPoolItemService.addReward('blind-box', {
    blindBoxId: blindBox.id,
    rewardProductId: 'reward-1',
    rewardVariantId: 'r1v1',
    rewardTitleSnapshot: 'Prize A',
  });

  const result = await context.paidOrderAssignmentService.processPaidOrder('blind-box', buildPaidOrderPayload());

  // Draft box is not in the active detection set → no match, no assignment.
  assert.equal(result.assignments.length, 0);
  assert.equal(result.matchedLineCount, 0);
});

test('execute mode decrements the chosen reward inventory via the gateway', async () => {
  const gateway = new TestInventoryGateway();
  const context = await createBlindBoxTestContext({
    random: () => 0.5,
    inventoryExecutionMode: 'execute',
    inventoryGateway: gateway,
    configuredLocationId: 'test-location-1',
  });
  await seedActiveBox(context, [{ productId: 'reward-1', variantId: 'r1v1', title: 'Prize A', stock: 5 }]);

  const result = await context.paidOrderAssignmentService.processPaidOrder('blind-box', buildPaidOrderPayload());

  assert.equal(result.assignments.length, 1);
  assert.equal(result.assignments[0].selectedRewardProductId, 'reward-1');
  assert.equal(gateway.commitRequests.length, 1);
  assert.equal(gateway.commitRequests[0].sourceProductId, 'reward-1');
});
