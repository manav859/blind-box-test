import { BlindBoxProductMapping } from './types';
import { OrderPaidLineItem, OrderPaidWebhookPayload, getOrderLineItems } from './order-paid';

export type BlindBoxOrderDetectionReason =
  | 'BLIND_BOX_MATCH'
  | 'NO_MAPPING'
  | 'MAPPING_DISABLED'
  | 'MISSING_PRODUCT_ID'
  | 'MISSING_LINE_ITEM_ID';

export interface BlindBoxOrderDetectionResult {
  lineItem: OrderPaidLineItem;
  reason: BlindBoxOrderDetectionReason;
  mapping?: BlindBoxProductMapping;
}

function normalizedVariantId(variantId?: string | null): string | null {
  return variantId && variantId.trim() ? variantId : null;
}

function findBestMappingForLineItem(
  lineItem: OrderPaidLineItem,
  productMappings: BlindBoxProductMapping[],
): BlindBoxProductMapping | undefined {
  const productMappingsForProduct = productMappings.filter(
    (mapping) => mapping.productId === lineItem.product_id,
  );

  const variantId = normalizedVariantId(lineItem.variant_id);

  const exactVariantMapping = productMappingsForProduct.find(
    (mapping) => normalizedVariantId(mapping.productVariantId) === variantId,
  );

  if (exactVariantMapping) {
    return exactVariantMapping;
  }

  return productMappingsForProduct.find((mapping) => !normalizedVariantId(mapping.productVariantId));
}

export function detectBlindBoxOrderLines(
  payload: OrderPaidWebhookPayload,
  productMappings: BlindBoxProductMapping[],
): BlindBoxOrderDetectionResult[] {
  return getOrderLineItems(payload).map((lineItem) => {
    if (!lineItem.id) {
      return {
        lineItem,
        reason: 'MISSING_LINE_ITEM_ID',
      };
    }

    if (!lineItem.product_id) {
      return {
        lineItem,
        reason: 'MISSING_PRODUCT_ID',
      };
    }

    const bestMapping = findBestMappingForLineItem(lineItem, productMappings);
    if (!bestMapping) {
      return {
        lineItem,
        reason: 'NO_MAPPING',
      };
    }

    if (!bestMapping.enabled) {
      return {
        lineItem,
        reason: 'MAPPING_DISABLED',
        mapping: bestMapping,
      };
    }

    return {
      lineItem,
      reason: 'BLIND_BOX_MATCH',
      mapping: bestMapping,
    };
  });
}
