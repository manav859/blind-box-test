import assert from 'node:assert/strict';
import test from 'node:test';
import { ShoplineCollection, ShoplineProduct } from '../../integration/shopline/catalog-gateway';
import { OrderPaidWebhookPayload } from '../../domain/blind-box/order-paid';
import { createBlindBoxTestContext } from '../../test-utils/blind-box-test-context';

function buildCollection(id: string, title: string, handle?: string): ShoplineCollection {
  return {
    id,
    title,
    handle: handle || title.toLowerCase().replace(/\s+/g, '-'),
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
  tags: string[] = [],
): ShoplineProduct {
  return {
    id,
    title,
    status: 'active',
    published: true,
    tags,
    templatePath: null,
    productType: 'NORMAL',
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
    id: 'order-4001',
    line_items: [
      {
        id: 'line-1',
        product_id: 'product-1',
        variant_id: 'variant-1',
        quantity: 1,
        title: 'Tagged Blind Box',
      },
    ],
  };
}

test('paid-order detection auto-hydrates a tagged blind-box product without pre-registration', async () => {
  const context = await createBlindBoxTestContext();
  context.testCatalogService.setProduct(
    buildProduct('product-1', 'Tagged Blind Box', 'variant-1', 25, ['blind-box']),
  );

  const result = await context.paidOrderAssignmentService.processPaidOrder('blind-box', buildPaidOrderPayload());
  const blindBoxes = await context.blindBoxService.listBlindBoxes('blind-box');

  assert.equal(result.assignments.length, 0);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].reason, 'REWARD_COLLECTION_NOT_CONFIGURED');
  assert.equal(blindBoxes.length, 1);
  assert.equal(blindBoxes[0].shoplineProductId, 'product-1');
  assert.equal(blindBoxes[0].productTitleSnapshot, 'Tagged Blind Box');
});

test('tagged blind-box products resolve the reward collection automatically and remain idempotent', async () => {
  const context = await createBlindBoxTestContext({
    random: () => 0.1,
  });

  context.testCatalogService.setProduct(
    buildProduct('product-1', 'Tagged Blind Box', 'variant-1', 25, [
      'blind-box',
      'blind-box-collection:anime-figures',
    ]),
  );
  context.testCatalogService.setCollection(buildCollection('collection-1', 'Anime Figures', 'anime-figures'), [
    buildProduct('reward-1', 'Prize A', 'reward-1-v1', 8),
    buildProduct('reward-2', 'Prize B', 'reward-2-v1', 5),
  ]);

  const detectedBlindBoxes = await context.blindBoxDiscoveryService.listDetectedBlindBoxes('blind-box');
  assert.equal(detectedBlindBoxes.length, 1);

  const firstPass = await context.paidOrderAssignmentService.processPaidOrder('blind-box', buildPaidOrderPayload());
  const secondPass = await context.paidOrderAssignmentService.processPaidOrder('blind-box', buildPaidOrderPayload());

  assert.equal(firstPass.assignments.length, 1);
  assert.equal(firstPass.assignments[0].selectedRewardProductId, 'reward-1');
  assert.equal(secondPass.assignments.length, 1);
  assert.equal(secondPass.assignments[0].selectedRewardProductId, 'reward-1');
  assert.equal(secondPass.assignments[0].wasExistingAssignment, true);
});

test('untagged blind-box products still use the fallback reward-group link for backward compatibility', async () => {
  const context = await createBlindBoxTestContext({
    random: () => 0.1,
  });

  context.testCatalogService.setProduct(
    buildProduct('product-1', 'Tagged Blind Box', 'variant-1', 25, ['blind-box']),
  );
  context.testCatalogService.setCollection(buildCollection('collection-1', 'Rewards'), [
    buildProduct('reward-1', 'Prize A', 'reward-1-v1', 8),
  ]);

  const detectedBlindBoxes = await context.blindBoxDiscoveryService.listDetectedBlindBoxes('blind-box');
  const rewardGroup = await context.rewardGroupService.upsertRewardGroup('blind-box', {
    shoplineCollectionId: 'collection-1',
    status: 'active',
  });
  await context.blindBoxRewardGroupLinkService.upsertLink('blind-box', {
    blindBoxId: detectedBlindBoxes[0].id,
    rewardGroupId: rewardGroup.id,
  });

  const result = await context.paidOrderAssignmentService.processPaidOrder('blind-box', buildPaidOrderPayload());

  assert.equal(result.assignments.length, 1);
  assert.equal(result.assignments[0].selectedRewardProductId, 'reward-1');
});

test('invalid blind-box collection tags fail gracefully during webhook assignment', async () => {
  const context = await createBlindBoxTestContext();
  context.testCatalogService.setProduct(
    buildProduct('product-1', 'Tagged Blind Box', 'variant-1', 25, ['blind-box', 'blind-box-collection:']),
  );

  const detectedBlindBoxes = await context.blindBoxDiscoveryService.listDetectedBlindBoxes('blind-box');
  assert.equal(detectedBlindBoxes.length, 1);

  const result = await context.paidOrderAssignmentService.processPaidOrder('blind-box', buildPaidOrderPayload());

  assert.equal(result.assignments.length, 0);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].reason, 'REWARD_COLLECTION_NOT_CONFIGURED');
});

test('tagged blind-box products fail with a structured collection-not-found error when the handle is missing', async () => {
  const context = await createBlindBoxTestContext();
  context.testCatalogService.setProduct(
    buildProduct('product-1', 'Tagged Blind Box', 'variant-1', 25, [
      'blind-box',
      'blind-box-collection:missing-collection',
    ]),
  );

  const detectedBlindBoxes = await context.blindBoxDiscoveryService.listDetectedBlindBoxes('blind-box');
  assert.equal(detectedBlindBoxes.length, 1);

  const result = await context.paidOrderAssignmentService.processPaidOrder('blind-box', buildPaidOrderPayload());

  assert.equal(result.assignments.length, 0);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].reason, 'REWARD_COLLECTION_NOT_FOUND');
  assert.match(result.failures[0].message, /missing-collection/i);
});

test('a tagged blind-box product does not fall back to the legacy link when the primary handle is broken', async () => {
  const context = await createBlindBoxTestContext();
  context.testCatalogService.setProduct(
    buildProduct('product-1', 'Tagged Blind Box', 'variant-1', 25, [
      'blind-box',
      'blind-box-collection:missing-collection',
    ]),
  );
  context.testCatalogService.setCollection(buildCollection('collection-fallback', 'Fallback Rewards'), [
    buildProduct('reward-fallback', 'Prize From Fallback', 'reward-fallback-v1', 8),
  ]);

  const detectedBlindBoxes = await context.blindBoxDiscoveryService.listDetectedBlindBoxes('blind-box');
  const rewardGroup = await context.rewardGroupService.upsertRewardGroup('blind-box', {
    shoplineCollectionId: 'collection-fallback',
    status: 'active',
  });
  await context.blindBoxRewardGroupLinkService.upsertLink('blind-box', {
    blindBoxId: detectedBlindBoxes[0].id,
    rewardGroupId: rewardGroup.id,
  });

  const result = await context.paidOrderAssignmentService.processPaidOrder('blind-box', buildPaidOrderPayload());

  assert.equal(result.assignments.length, 0);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].reason, 'REWARD_COLLECTION_NOT_FOUND');
});
