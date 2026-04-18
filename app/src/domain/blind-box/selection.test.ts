import assert from 'node:assert/strict';
import test from 'node:test';
import { BlindBox, BlindBoxPoolItem } from './types';
import { getEligiblePoolItems, selectPoolItemForBlindBox } from './selection';

const uniformBlindBox: BlindBox = {
  id: 'box-uniform',
  shop: 'blind-box',
  name: 'Uniform Box',
  description: null,
  status: 'active',
  selectionStrategy: 'uniform',
  shoplineProductId: null,
  shoplineVariantId: null,
  productTitleSnapshot: null,
  configJson: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const weightedBlindBox: BlindBox = {
  ...uniformBlindBox,
  id: 'box-weighted',
  selectionStrategy: 'weighted',
};

const poolItems: BlindBoxPoolItem[] = [
  {
    id: 'item-1',
    shop: 'blind-box',
    blindBoxId: 'box-uniform',
    label: 'Prize A',
    sourceProductId: null,
    sourceVariantId: null,
    enabled: true,
    weight: 1,
    inventoryQuantity: 10,
    metadata: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'item-2',
    shop: 'blind-box',
    blindBoxId: 'box-uniform',
    label: 'Prize B',
    sourceProductId: null,
    sourceVariantId: null,
    enabled: true,
    weight: 3,
    inventoryQuantity: 2,
    metadata: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

test('getEligiblePoolItems excludes disabled and out-of-stock items', () => {
  const eligible = getEligiblePoolItems([
    ...poolItems,
    {
      ...poolItems[0],
      id: 'item-3',
      enabled: false,
    },
    {
      ...poolItems[0],
      id: 'item-4',
      inventoryQuantity: 0,
    },
  ]);

  assert.deepEqual(
    eligible.map((item) => item.id),
    ['item-1', 'item-2'],
  );
});

test('selectPoolItemForBlindBox supports uniform selection', () => {
  const selected = selectPoolItemForBlindBox(uniformBlindBox, poolItems, {
    random: () => 0.75,
  });

  assert.equal(selected.id, 'item-2');
});

test('selectPoolItemForBlindBox supports weighted selection', () => {
  const selected = selectPoolItemForBlindBox(weightedBlindBox, poolItems, {
    random: () => 0.6,
  });

  assert.equal(selected.id, 'item-2');
});

test('selectPoolItemForBlindBox fails safely when weighted pool contains zero-weight eligible items', () => {
  assert.throws(() =>
    selectPoolItemForBlindBox(
      weightedBlindBox,
      [
        {
          ...poolItems[0],
          weight: 0,
        },
      ],
      {
        random: () => 0.1,
      },
    ),
  );
});
