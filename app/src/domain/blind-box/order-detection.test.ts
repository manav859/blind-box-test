import assert from 'node:assert/strict';
import test from 'node:test';
import { detectBlindBoxOrderLines } from './order-detection';
import { BlindBoxProductMapping } from './types';
import { OrderPaidWebhookPayload } from './order-paid';

const baseMappings: BlindBoxProductMapping[] = [
  {
    id: 'mapping-generic',
    shop: 'blind-box',
    blindBoxId: 'box-1',
    productId: 'product-1',
    productVariantId: null,
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'mapping-variant-disabled',
    shop: 'blind-box',
    blindBoxId: 'box-2',
    productId: 'product-2',
    productVariantId: 'variant-2a',
    enabled: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

test('detectBlindBoxOrderLines marks mapped order lines explicitly', () => {
  const payload: OrderPaidWebhookPayload = {
    id: 'order-1',
    line_items: [
      {
        id: 'line-1',
        product_id: 'product-1',
        variant_id: 'variant-1',
      },
      {
        id: 'line-2',
        product_id: 'product-9',
      },
    ],
  };

  const detections = detectBlindBoxOrderLines(payload, baseMappings);
  assert.equal(detections[0].reason, 'BLIND_BOX_MATCH');
  assert.equal(detections[0].mapping?.blindBoxId, 'box-1');
  assert.equal(detections[1].reason, 'NO_MAPPING');
});

test('detectBlindBoxOrderLines respects a disabled variant-specific mapping', () => {
  const payload: OrderPaidWebhookPayload = {
    id: 'order-1',
    line_items: [
      {
        id: 'line-1',
        product_id: 'product-2',
        variant_id: 'variant-2a',
      },
    ],
  };

  const detections = detectBlindBoxOrderLines(payload, baseMappings);
  assert.equal(detections[0].reason, 'MAPPING_DISABLED');
  assert.equal(detections[0].mapping?.blindBoxId, 'box-2');
});
