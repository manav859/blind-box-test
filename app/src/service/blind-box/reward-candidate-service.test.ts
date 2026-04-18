import assert from 'node:assert/strict';
import test from 'node:test';
import { ShoplineCollection, ShoplineProduct } from '../../integration/shopline/catalog-gateway';
import { createBlindBoxTestContext } from '../../test-utils/blind-box-test-context';

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
  variants: Array<{
    id: string;
    title: string;
    inventoryQuantity: number | null;
    available?: boolean | null;
  }>,
  options: {
    status?: string | null;
    published?: boolean | null;
    tags?: string[];
  } = {},
): ShoplineProduct {
  return {
    id,
    title,
    status: options.status ?? 'active',
    published: options.published ?? true,
    tags: options.tags ?? [],
    templatePath: null,
    productType: 'NORMAL',
    variants: variants.map((variant) => ({
      id: variant.id,
      title: variant.title,
      sku: `sku-${variant.id}`,
      inventoryQuantity: variant.inventoryQuantity,
      tracked: true,
      available: variant.available ?? true,
      raw: {},
    })),
    raw: {},
  };
}

test('reward candidate preview resolves the reward collection from the blind-box product tag', async () => {
  const context = await createBlindBoxTestContext();
  const blindBox = await context.blindBoxService.createBlindBox('blind-box', {
    name: 'Tagged Box',
    status: 'active',
    selectionStrategy: 'uniform',
    shoplineProductId: 'product-1',
    shoplineVariantId: 'variant-1',
  });

  context.testCatalogService.setProduct(
    buildProduct(
      'product-1',
      'Blind Box Product',
      [
        {
          id: 'variant-1',
          title: 'Blind Box Default',
          inventoryQuantity: 10,
        },
      ],
      {
        tags: ['blind-box', 'blind-box-collection:anime-figures'],
      },
    ),
  );
  context.testCatalogService.setCollection(
    {
      ...buildCollection('collection-1', 'Anime Figures'),
      handle: 'anime-figures',
    },
    [
      buildProduct('reward-1', 'Prize A', [
        {
          id: 'reward-1-v1',
          title: 'Default',
          inventoryQuantity: 7,
        },
      ]),
    ],
  );

  const preview = await context.rewardCandidateService.previewCandidatesForBlindBox('blind-box', blindBox.id);

  assert.equal(preview.resolutionSource, 'product_tag');
  assert.equal(preview.rewardGroup, null);
  assert.equal(preview.collection.handle, 'anime-figures');
  assert.equal(preview.eligibleCandidates.length, 1);
});

test('reward candidate preview falls back to the stored reward-group link when no product tag is present', async () => {
  const context = await createBlindBoxTestContext();
  const blindBox = await context.blindBoxService.createBlindBox('blind-box', {
    name: 'Starter Box',
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
    buildProduct('product-1', 'Blind Box Product', [
      {
        id: 'variant-1',
        title: 'Blind Box Default',
        inventoryQuantity: 10,
      },
    ]),
  );
  context.testCatalogService.setCollection(buildCollection('collection-1', 'Rewards'), [
    buildProduct('product-1', 'Blind Box Product', [
      {
        id: 'variant-1',
        title: 'Blind Box Default',
        inventoryQuantity: 10,
      },
    ]),
    buildProduct('reward-1', 'Prize A', [
      {
        id: 'reward-1-v1',
        title: 'Default',
        inventoryQuantity: 7,
      },
    ]),
    buildProduct('reward-2', 'Prize B', [
      {
        id: 'reward-2-v1',
        title: 'Default',
        inventoryQuantity: 0,
      },
    ]),
  ]);

  const preview = await context.rewardCandidateService.previewCandidatesForBlindBox(
    'blind-box',
    blindBox.id,
  );

  assert.equal(preview.resolutionSource, 'reward_group_link');
  assert.equal(preview.rawCollectionSize, 3);
  assert.equal(preview.eligibleCandidates.length, 1);
  assert.equal(preview.eligibleCandidates[0].productId, 'reward-1');
  assert.deepEqual(
    preview.excludedCandidates.map((candidate) => candidate.reason).sort(),
    ['OUT_OF_STOCK', 'SELF_REWARD_PRODUCT'],
  );
});

test('reward candidate preview fails gracefully when the collection tag is invalid', async () => {
  const context = await createBlindBoxTestContext();
  const blindBox = await context.blindBoxService.createBlindBox('blind-box', {
    name: 'Broken Tag Box',
    status: 'active',
    selectionStrategy: 'uniform',
    shoplineProductId: 'product-1',
    shoplineVariantId: 'variant-1',
  });

  context.testCatalogService.setProduct(
    buildProduct(
      'product-1',
      'Blind Box Product',
      [
        {
          id: 'variant-1',
          title: 'Blind Box Default',
          inventoryQuantity: 10,
        },
      ],
      {
        tags: ['blind-box', 'blind-box-collection:'],
      },
    ),
  );

  await assert.rejects(
    () => context.rewardCandidateService.previewCandidatesForBlindBox('blind-box', blindBox.id),
    /does not contain a valid collection handle/i,
  );
});

test('reward candidate preview fails clearly when the tagged collection handle does not exist', async () => {
  const context = await createBlindBoxTestContext();
  const blindBox = await context.blindBoxService.createBlindBox('blind-box', {
    name: 'Missing Collection Box',
    status: 'active',
    selectionStrategy: 'uniform',
    shoplineProductId: 'product-1',
    shoplineVariantId: 'variant-1',
  });

  context.testCatalogService.setProduct(
    buildProduct(
      'product-1',
      'Blind Box Product',
      [
        {
          id: 'variant-1',
          title: 'Blind Box Default',
          inventoryQuantity: 10,
        },
      ],
      {
        tags: ['blind-box', 'blind-box-collection:missing-collection'],
      },
    ),
  );

  await assert.rejects(
    () => context.rewardCandidateService.previewCandidatesForBlindBox('blind-box', blindBox.id),
    /does not exist: missing-collection/i,
  );
});

test('reward candidate preview does not let the legacy fallback override a tagged collection', async () => {
  const context = await createBlindBoxTestContext();
  const blindBox = await context.blindBoxService.createBlindBox('blind-box', {
    name: 'Primary Tag Box',
    status: 'active',
    selectionStrategy: 'uniform',
    shoplineProductId: 'product-1',
    shoplineVariantId: 'variant-1',
  });
  const fallbackRewardGroup = await context.rewardGroupService.upsertRewardGroup('blind-box', {
    shoplineCollectionId: 'collection-fallback',
    status: 'active',
  });
  await context.blindBoxRewardGroupLinkService.upsertLink('blind-box', {
    blindBoxId: blindBox.id,
    rewardGroupId: fallbackRewardGroup.id,
  });

  context.testCatalogService.setProduct(
    buildProduct(
      'product-1',
      'Blind Box Product',
      [
        {
          id: 'variant-1',
          title: 'Blind Box Default',
          inventoryQuantity: 10,
        },
      ],
      {
        tags: ['blind-box', 'blind-box-collection:anime-figures'],
      },
    ),
  );
  context.testCatalogService.setCollection(
    {
      ...buildCollection('collection-tag', 'Anime Figures'),
      handle: 'anime-figures',
    },
    [
      buildProduct('reward-tag', 'Prize From Tag', [
        {
          id: 'reward-tag-v1',
          title: 'Default',
          inventoryQuantity: 4,
        },
      ]),
    ],
  );
  context.testCatalogService.setCollection(buildCollection('collection-fallback', 'Fallback Rewards'), [
    buildProduct('reward-fallback', 'Prize From Fallback', [
      {
        id: 'reward-fallback-v1',
        title: 'Default',
        inventoryQuantity: 9,
      },
    ]),
  ]);

  const preview = await context.rewardCandidateService.previewCandidatesForBlindBox(
    'blind-box',
    blindBox.id,
  );

  assert.equal(preview.resolutionSource, 'product_tag');
  assert.equal(preview.rewardGroup, null);
  assert.equal(preview.collection.id, 'collection-tag');
  assert.equal(preview.eligibleCandidates[0].productId, 'reward-tag');
});

test('reward candidate preview marks ambiguous multi-variant rewards as excluded', async () => {
  const context = await createBlindBoxTestContext();
  const blindBox = await context.blindBoxService.createBlindBox('blind-box', {
    name: 'Multi Variant Box',
    status: 'active',
    selectionStrategy: 'uniform',
    shoplineProductId: 'product-1',
    shoplineVariantId: 'variant-1',
  });
  const rewardGroup = await context.rewardGroupService.upsertRewardGroup('blind-box', {
    shoplineCollectionId: 'collection-2',
    status: 'active',
  });
  await context.blindBoxRewardGroupLinkService.upsertLink('blind-box', {
    blindBoxId: blindBox.id,
    rewardGroupId: rewardGroup.id,
  });

  context.testCatalogService.setProduct(
    buildProduct('product-1', 'Blind Box Product', [
      {
        id: 'variant-1',
        title: 'Blind Box Default',
        inventoryQuantity: 10,
      },
    ]),
  );
  context.testCatalogService.setCollection(buildCollection('collection-2', 'Rewards'), [
    buildProduct('reward-3', 'Prize With Variants', [
      {
        id: 'reward-3-v1',
        title: 'Blue',
        inventoryQuantity: 4,
      },
      {
        id: 'reward-3-v2',
        title: 'Pink',
        inventoryQuantity: 6,
      },
    ]),
  ]);

  const preview = await context.rewardCandidateService.previewCandidatesForBlindBox(
    'blind-box',
    blindBox.id,
  );

  assert.equal(preview.eligibleCandidates.length, 0);
  assert.equal(preview.excludedCandidates.length, 1);
  assert.equal(preview.excludedCandidates[0].reason, 'AMBIGUOUS_VARIANTS');
});
