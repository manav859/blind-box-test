import assert from 'node:assert/strict';
import test from 'node:test';
import { ShoplineProduct } from '../../integration/shopline/catalog-gateway';
import { createBlindBoxTestContext } from '../../test-utils/blind-box-test-context';

function buildProduct(
  id: string,
  title: string,
  variants: Array<{ id: string; title?: string; inventoryQuantity: number }>,
  status = 'active',
): ShoplineProduct {
  return {
    id,
    title,
    status,
    published: true,
    imageUrl: null,
    variants: variants.map((v) => ({
      id: v.id,
      title: v.title ?? 'Default',
      sku: `sku-${v.id}`,
      inventoryQuantity: v.inventoryQuantity,
      tracked: true,
      available: v.inventoryQuantity > 0,
      raw: {},
    })),
    raw: {},
  };
}

/** Create a draft box with a trigger product and a set of reward pool items. */
async function seedBox(
  context: Awaited<ReturnType<typeof createBlindBoxTestContext>>,
  rewards: Array<{ productId: string; variantId: string; title: string; stock: number }>,
) {
  context.testCatalogService.setProduct(buildProduct('trigger-1', 'Mystery Box', [{ id: 'tv-1', inventoryQuantity: 100 }]));
  const blindBox = await context.blindBoxService.createBlindBox('blind-box', {
    name: 'Test Box',
    status: 'draft',
    triggerProductId: 'trigger-1',
    triggerProductTitleSnapshot: 'Mystery Box',
  });
  for (const reward of rewards) {
    context.testCatalogService.setProduct(
      buildProduct(reward.productId, reward.title, [{ id: reward.variantId, inventoryQuantity: reward.stock }]),
    );
    await context.blindBoxPoolItemService.addReward('blind-box', {
      blindBoxId: blindBox.id,
      rewardProductId: reward.productId,
      rewardVariantId: reward.variantId,
      rewardTitleSnapshot: reward.title,
    });
  }
  return blindBox;
}

test('reward preview builds candidates from the pool weighted by live inventory', async () => {
  const context = await createBlindBoxTestContext();
  const blindBox = await seedBox(context, [
    { productId: 'reward-1', variantId: 'r1v1', title: 'Prize A', stock: 3 },
    { productId: 'reward-2', variantId: 'r2v1', title: 'Prize B', stock: 7 },
  ]);

  const preview = await context.rewardCandidateService.previewCandidatesForBlindBox('blind-box', blindBox.id);

  assert.equal(preview.poolSize, 2);
  assert.equal(preview.inStockCount, 2);
  assert.equal(preview.eligibleCandidates.length, 2);
  // selectionWeight == live inventory (this is what drives P = stock / Σ stock).
  const byProduct = Object.fromEntries(preview.eligibleCandidates.map((c) => [c.productId, c.selectionWeight]));
  assert.equal(byProduct['reward-1'], 3);
  assert.equal(byProduct['reward-2'], 7);
});

test('reward preview excludes out-of-stock pool items', async () => {
  const context = await createBlindBoxTestContext();
  const blindBox = await seedBox(context, [
    { productId: 'reward-1', variantId: 'r1v1', title: 'In Stock', stock: 5 },
    { productId: 'reward-2', variantId: 'r2v1', title: 'Sold Out', stock: 0 },
  ]);

  const preview = await context.rewardCandidateService.previewCandidatesForBlindBox('blind-box', blindBox.id);

  assert.equal(preview.poolSize, 2);
  assert.equal(preview.inStockCount, 1);
  assert.equal(preview.eligibleCandidates[0].productId, 'reward-1');
  assert.equal(preview.excludedCandidates.length, 1);
  assert.equal(preview.excludedCandidates[0].reason, 'OUT_OF_STOCK');
});

test('reward preview excludes the trigger product if it is also in the pool', async () => {
  const context = await createBlindBoxTestContext();
  const blindBox = await seedBox(context, [{ productId: 'reward-1', variantId: 'r1v1', title: 'Prize A', stock: 4 }]);
  // Add the trigger product itself as a (mistaken) reward.
  await context.blindBoxPoolItemService.addReward('blind-box', {
    blindBoxId: blindBox.id,
    rewardProductId: 'trigger-1',
    rewardVariantId: 'tv-1',
    rewardTitleSnapshot: 'Mystery Box',
  });

  const preview = await context.rewardCandidateService.previewCandidatesForBlindBox('blind-box', blindBox.id);

  assert.equal(preview.inStockCount, 1);
  assert.equal(preview.eligibleCandidates[0].productId, 'reward-1');
  assert.ok(preview.excludedCandidates.some((c) => c.reason === 'SELF_REWARD_PRODUCT'));
});

test('reward preview reports an empty pool', async () => {
  const context = await createBlindBoxTestContext();
  const blindBox = await seedBox(context, []);

  const preview = await context.rewardCandidateService.previewCandidatesForBlindBox('blind-box', blindBox.id);

  assert.equal(preview.poolSize, 0);
  assert.equal(preview.inStockCount, 0);
  assert.equal(preview.eligibleCandidates.length, 0);
});
