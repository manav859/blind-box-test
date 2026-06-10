import assert from 'node:assert/strict';
import test from 'node:test';
import { ShoplineProduct } from '../../integration/shopline/catalog-gateway';
import { createBlindBoxTestContext } from '../../test-utils/blind-box-test-context';

function buildProduct(id: string, title: string, stock: number): ShoplineProduct {
  return {
    id,
    title,
    status: 'active',
    published: true,
    imageUrl: null,
    variants: [
      { id: `${id}-v1`, title: 'Default', sku: `sku-${id}`, inventoryQuantity: stock, tracked: true, available: stock > 0, raw: {} },
    ],
    raw: {},
  };
}

test('readiness fails when the pool is empty', async () => {
  const context = await createBlindBoxTestContext();
  context.testCatalogService.setProduct(buildProduct('trigger-1', 'Box', 100));
  const blindBox = await context.blindBoxService.createBlindBox('blind-box', {
    name: 'Box',
    status: 'draft',
    triggerProductId: 'trigger-1',
  });

  const report = await context.blindBoxActivationReadinessService.getReadinessReport('blind-box', blindBox.id);

  assert.equal(report.status, 'not_ready');
  assert.ok(report.issues.some((i) => i.code === 'EMPTY_POOL'));
});

test('readiness fails when every reward is out of stock', async () => {
  const context = await createBlindBoxTestContext();
  context.testCatalogService.setProduct(buildProduct('trigger-1', 'Box', 100));
  context.testCatalogService.setProduct(buildProduct('reward-1', 'Prize A', 0));
  const blindBox = await context.blindBoxService.createBlindBox('blind-box', {
    name: 'Box',
    status: 'draft',
    triggerProductId: 'trigger-1',
  });
  await context.blindBoxPoolItemService.addReward('blind-box', {
    blindBoxId: blindBox.id,
    rewardProductId: 'reward-1',
    rewardVariantId: 'reward-1-v1',
    rewardTitleSnapshot: 'Prize A',
  });

  const report = await context.blindBoxActivationReadinessService.getReadinessReport('blind-box', blindBox.id);

  assert.equal(report.status, 'not_ready');
  assert.ok(report.issues.some((i) => i.code === 'NO_REWARD_IN_STOCK'));
});

test('readiness succeeds with a trigger product and at least one in-stock reward', async () => {
  const context = await createBlindBoxTestContext();
  context.testCatalogService.setProduct(buildProduct('trigger-1', 'Box', 100));
  context.testCatalogService.setProduct(buildProduct('reward-1', 'Prize A', 5));
  const blindBox = await context.blindBoxService.createBlindBox('blind-box', {
    name: 'Box',
    status: 'draft',
    triggerProductId: 'trigger-1',
  });
  await context.blindBoxPoolItemService.addReward('blind-box', {
    blindBoxId: blindBox.id,
    rewardProductId: 'reward-1',
    rewardVariantId: 'reward-1-v1',
    rewardTitleSnapshot: 'Prize A',
  });

  const report = await context.blindBoxActivationReadinessService.getReadinessReport('blind-box', blindBox.id);

  assert.equal(report.status, 'ready');
  assert.equal(report.inStockCount, 1);
  assert.equal(report.issues.length, 0);
});
