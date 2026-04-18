import assert from 'node:assert/strict';
import test from 'node:test';
import { ShoplineCollection, ShoplineProduct } from '../../integration/shopline/catalog-gateway';
import { createBlindBoxTestContext, TestInventoryGateway } from '../../test-utils/blind-box-test-context';

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

test('blind box activation readiness reports product-tag resolution for collection-linked blind boxes', async () => {
  const context = await createBlindBoxTestContext();
  const blindBox = await context.blindBoxService.createBlindBox('blind-box', {
    name: 'Tagged Ready Box',
    status: 'draft',
    selectionStrategy: 'uniform',
    shoplineProductId: 'product-1',
    shoplineVariantId: 'variant-1',
  });

  context.testCatalogService.setProduct(
    buildProduct('product-1', 'Tagged Blind Box', 'variant-1', 20, [
      'blind-box',
      'blind-box-collection:anime-figures',
    ]),
  );
  context.testCatalogService.setCollection(buildCollection('collection-1', 'Anime Figures', 'anime-figures'), [
    buildProduct('reward-1', 'Prize A', 'reward-1-v1', 8),
  ]);

  const report = await context.blindBoxActivationReadinessService.getReadinessReport(
    'blind-box',
    blindBox.id,
  );

  assert.equal(report.status, 'ready');
  assert.equal(report.mode, 'collection_linked');
  assert.equal(report.resolutionSource, 'product_tag');
  assert.equal(report.rewardGroup, null);
  assert.equal(report.collection?.handle, 'anime-figures');
  assert.equal(report.eligibleCandidates.length, 1);
});

test('blind box activation readiness requires an enabled blind-box product mapping', async () => {
  const context = await createBlindBoxTestContext();
  const blindBox = await context.blindBoxService.createBlindBox('blind-box', {
    name: 'Activation Check',
    status: 'draft',
    selectionStrategy: 'uniform',
  });

  await context.blindBoxPoolItemService.upsertPoolItem('blind-box', {
    blindBoxId: blindBox.id,
    label: 'Prize A',
    weight: 1,
    inventoryQuantity: 3,
  });

  await assert.rejects(
    () =>
      context.blindBoxActivationReadinessService.assertReadyForActivation(
        'blind-box',
        blindBox.id,
      ),
    /product mapping exists/i,
  );
});

test('blind box activation readiness requires at least one execute-mode ready pool item when execution mode is enabled', async () => {
  const context = await createBlindBoxTestContext({
    inventoryExecutionMode: 'execute',
    inventoryGateway: new TestInventoryGateway({
      validation: 'not_tracked',
    }),
  });
  const blindBox = await context.blindBoxService.createBlindBox('blind-box', {
    name: 'Execute Ready',
    status: 'draft',
    selectionStrategy: 'uniform',
  });

  await context.blindBoxPoolItemService.upsertPoolItem('blind-box', {
    blindBoxId: blindBox.id,
    label: 'Prize A',
    weight: 1,
    inventoryQuantity: 3,
    sourceProductId: 'product-1',
    sourceVariantId: 'variant-1',
  });

  await context.blindBoxProductMappingService.upsertProductMapping('blind-box', {
    blindBoxId: blindBox.id,
    productId: 'product-1',
    productVariantId: 'variant-1',
    enabled: true,
  });

  await assert.rejects(
    () =>
      context.blindBoxActivationReadinessService.assertReadyForActivation(
        'blind-box',
        blindBox.id,
      ),
    /passes execute-mode readiness validation/i,
  );
});

test('blind box activation readiness succeeds when a valid sold mapping and a ready pool item exist', async () => {
  const context = await createBlindBoxTestContext({
    inventoryExecutionMode: 'execute',
  });
  const blindBox = await context.blindBoxService.createBlindBox('blind-box', {
    name: 'Ready Box',
    status: 'draft',
    selectionStrategy: 'uniform',
  });

  await context.blindBoxPoolItemService.upsertPoolItem('blind-box', {
    blindBoxId: blindBox.id,
    label: 'Prize A',
    weight: 1,
    inventoryQuantity: 3,
    sourceProductId: 'product-1',
    sourceVariantId: 'variant-1',
  });

  await context.blindBoxProductMappingService.upsertProductMapping('blind-box', {
    blindBoxId: blindBox.id,
    productId: 'product-1',
    productVariantId: 'variant-1',
    enabled: true,
  });

  await assert.doesNotReject(() =>
    context.blindBoxActivationReadinessService.assertReadyForActivation(
      'blind-box',
      blindBox.id,
    ),
  );
});
