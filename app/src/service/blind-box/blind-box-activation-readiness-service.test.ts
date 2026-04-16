import assert from 'node:assert/strict';
import test from 'node:test';
import { createBlindBoxTestContext, TestInventoryGateway } from '../../test-utils/blind-box-test-context';

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
