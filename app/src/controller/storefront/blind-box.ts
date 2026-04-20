import express from 'express';
import { BlindBox, BlindBoxProductMapping } from '../../domain/blind-box/types';
import { isBlindBoxProduct } from '../../domain/blind-box/product-detection';
import { ValidationError } from '../../lib/errors';
import { sendErrorResponse } from '../../lib/http';
import { createRequestContext, getRequestIdFromHeaders } from '../../lib/request-context';
import { getBlindBoxService } from '../../service/blind-box/blind-box-service';
import { getBlindBoxDiscoveryService } from '../../service/blind-box/blind-box-discovery-service';
import { getBlindBoxProductMappingService } from '../../service/blind-box/product-mapping-service';
import { getShoplineCatalogService } from '../../service/shopline/catalog-service';
import { getBlindBoxPoolItemService } from '../../service/blind-box/pool-item-service';
import { getEligiblePoolItems, selectPoolItemForBlindBox } from '../../domain/blind-box/selection';
import { getBlindBoxAssignmentService } from '../../service/blind-box/assignment-service';

function setStorefrontHeaders(res: express.Response): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

function normalizeShopHandle(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim().toLowerCase();
  if (!normalizedValue) {
    return null;
  }

  return normalizedValue.replace(/\.myshopline\.com$/i, '');
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue ? normalizedValue : null;
}

function selectPreferredMapping(
  mappings: BlindBoxProductMapping[],
  productVariantId: string | null,
): BlindBoxProductMapping | null {
  if (mappings.length === 0) {
    return null;
  }

  if (productVariantId) {
    const variantMapping = mappings.find((mapping) => mapping.productVariantId === productVariantId);
    if (variantMapping) {
      return variantMapping;
    }
  }

  const productLevelMapping = mappings.find((mapping) => !mapping.productVariantId);
  return productLevelMapping || mappings[0] || null;
}

function toSyntheticBlindBoxReferenceMapping(
  blindBox: BlindBox,
): BlindBoxProductMapping | null {
  if (!blindBox?.shoplineProductId) {
    return null;
  }

  return {
    id: `blind-box-reference:${blindBox.id}`,
    shop: blindBox.shop,
    blindBoxId: blindBox.id,
    productId: blindBox.shoplineProductId,
    productVariantId: blindBox.shoplineVariantId,
    enabled: true,
    createdAt: blindBox.createdAt,
    updatedAt: blindBox.updatedAt,
  };
}

export function createBlindBoxStorefrontRouter(): express.Router {
  const router = express.Router();

  router.options('/product-status', (_req, res) => {
    setStorefrontHeaders(res);
    res.status(204).send();
  });

  router.get('/product-status', async (req, res) => {
    setStorefrontHeaders(res);

    const context = createRequestContext({
      requestId: getRequestIdFromHeaders(req.headers),
      shop: normalizeShopHandle(req.query.shop) || 'storefront',
    });

    try {
      const shop = normalizeShopHandle(req.query.shop);
      const productId = normalizeOptionalString(req.query.productId);
      const productVariantId = normalizeOptionalString(req.query.productVariantId);

      if (!shop) {
        throw new ValidationError('Missing required storefront blind-box query parameter: shop');
      }

      if (!productId) {
        throw new ValidationError('Missing required storefront blind-box query parameter: productId');
      }

      const productMappingService = await getBlindBoxProductMappingService();
      const blindBoxService = await getBlindBoxService();
      const blindBoxDiscoveryService = await getBlindBoxDiscoveryService();
      const catalogService = await getShoplineCatalogService();
      let selectedMapping: BlindBoxProductMapping | null = null;
      let blindBox = null;

      try {
        const product = await catalogService.getProduct(shop, productId);
        if (isBlindBoxProduct(product)) {
          blindBox = await blindBoxDiscoveryService.ensureBlindBoxForDetectedProduct(shop, product, {
            productVariantId,
          });
          selectedMapping = blindBox ? toSyntheticBlindBoxReferenceMapping(blindBox) : null;
        }
      } catch {
        selectedMapping = null;
      }

      if (!selectedMapping) {
        const blindBoxes = await blindBoxService.listBlindBoxes(shop);
        const directReferenceMappings = blindBoxes
          .map((currentBlindBox) => toSyntheticBlindBoxReferenceMapping(currentBlindBox))
          .filter((mapping): mapping is BlindBoxProductMapping => Boolean(mapping));
        const legacyMappings = await productMappingService.listEnabledProductMappingsForProduct(shop, productId);
        const legacyBlindBoxIds = new Set(directReferenceMappings.map((mapping) => mapping.blindBoxId));
        const mappings = [
          ...directReferenceMappings.filter((mapping) => mapping.productId === productId),
          ...legacyMappings.filter((mapping) => !legacyBlindBoxIds.has(mapping.blindBoxId)),
        ];
        selectedMapping = selectPreferredMapping(mappings, productVariantId);
      }

      if (!selectedMapping) {
        res.status(200).send({
          success: true,
          data: {
            isBlindBox: false,
            shop,
            productId,
            productVariantId,
            blindBox: null,
            mapping: null,
          },
        });
        return;
      }

      blindBox = blindBox || (await blindBoxService.getBlindBox(shop, selectedMapping.blindBoxId));
      const isBlindBox = blindBox?.status === 'active';

      res.status(200).send({
        success: true,
        data: {
          isBlindBox,
          shop,
          productId,
          productVariantId,
          blindBox: blindBox
            ? {
                id: blindBox.id,
                name: blindBox.name,
                description: blindBox.description,
                status: blindBox.status,
                selectionStrategy: blindBox.selectionStrategy,
              }
            : null,
          mapping: {
            id: selectedMapping.id,
            blindBoxId: selectedMapping.blindBoxId,
            productId: selectedMapping.productId,
            productVariantId: selectedMapping.productVariantId,
            enabled: selectedMapping.enabled,
          },
        },
      });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  router.options('/preview-selection', (_req, res) => {
    setStorefrontHeaders(res);
    res.status(204).send();
  });

  router.get('/preview-selection', async (req, res) => {
    setStorefrontHeaders(res);
    const context = createRequestContext({
      requestId: getRequestIdFromHeaders(req.headers),
      shop: normalizeShopHandle(req.query.shop) || 'storefront',
    });

    try {
      const shop = normalizeShopHandle(req.query.shop);
      const productId = normalizeOptionalString(req.query.productId);

      if (!shop) throw new ValidationError('Missing required query parameter: shop');
      if (!productId) throw new ValidationError('Missing required query parameter: productId');

      const blindBoxService = await getBlindBoxService();
      const blindBoxDiscoveryService = await getBlindBoxDiscoveryService();
      const poolItemService = await getBlindBoxPoolItemService();
      const catalogService = await getShoplineCatalogService();

      let blindBoxId: string | null = null;
      let blindBox = null;

      const product = await catalogService.getProduct(shop, productId).catch(() => null);
      if (product && isBlindBoxProduct(product)) {
        blindBox = await blindBoxDiscoveryService.ensureBlindBoxForDetectedProduct(shop, product).catch(() => null);
        if (blindBox) blindBoxId = blindBox.id;
      }

      if (!blindBoxId) {
        const productMappingService = await getBlindBoxProductMappingService();
        const mappings = await productMappingService.listEnabledProductMappingsForProduct(shop, productId);
        blindBoxId = mappings[0]?.blindBoxId ?? null;
      }

      if (!blindBoxId) {
        const blindBoxes = await blindBoxService.listBlindBoxes(shop);
        const match = blindBoxes.find((bb) => bb.shoplineProductId === productId);
        if (match) { blindBoxId = match.id; blindBox = match; }
      }

      if (!blindBoxId) {
        const allBoxes = await blindBoxService.listBlindBoxes(shop);
        const activeBox = allBoxes.find((bb) => bb.status === 'active');
        if (activeBox) { blindBoxId = activeBox.id; blindBox = activeBox; }
      }

      if (!blindBoxId) {
        res.status(200).send({ success: true, data: { selected: null, totalItems: 0 } });
        return;
      }

      if (!blindBox) blindBox = await blindBoxService.getBlindBox(shop, blindBoxId);

      const poolItems = await poolItemService.listPoolItems(shop, blindBoxId);
      const eligible = getEligiblePoolItems(poolItems);

      if (eligible.length === 0) {
        res.status(200).send({ success: true, data: { selected: null, totalItems: 0 } });
        return;
      }

      const selected = selectPoolItemForBlindBox(blindBox!, poolItems, { random: Math.random });

      res.status(200).send({
        success: true,
        data: {
          selected: {
            id: selected.id,
            label: selected.label,
            sourceProductId: selected.sourceProductId,
            sourceVariantId: selected.sourceVariantId,
            inventoryQuantity: selected.inventoryQuantity,
          },
          totalItems: eligible.length,
          blindBoxName: blindBox?.name ?? null,
        },
      });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  router.options('/assign-on-cart', (_req, res) => {
    setStorefrontHeaders(res);
    res.status(204).send();
  });

  router.post('/assign-on-cart', express.json(), async (req, res) => {
    setStorefrontHeaders(res);
    const context = createRequestContext({
      requestId: getRequestIdFromHeaders(req.headers),
      shop: normalizeShopHandle(req.body?.shop) || 'storefront',
    });

    try {
      const shop = normalizeShopHandle(req.body?.shop);
      const productId = normalizeOptionalString(req.body?.productId);
      const cartToken = normalizeOptionalString(req.body?.cartToken) || `cart-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      if (!shop) throw new ValidationError('Missing required body field: shop');
      if (!productId) throw new ValidationError('Missing required body field: productId');

      const blindBoxService = await getBlindBoxService();
      const blindBoxDiscoveryService = await getBlindBoxDiscoveryService();
      const poolItemService = await getBlindBoxPoolItemService();
      const assignmentService = await getBlindBoxAssignmentService();
      const catalogService = await getShoplineCatalogService();

      // Resolve blind box
      let blindBoxId: string | null = null;
      let blindBox = null;

      const product = await catalogService.getProduct(shop, productId).catch(() => null);
      if (product && isBlindBoxProduct(product)) {
        blindBox = await blindBoxDiscoveryService.ensureBlindBoxForDetectedProduct(shop, product).catch(() => null);
        if (blindBox) blindBoxId = blindBox.id;
      }

      if (!blindBoxId) {
        const productMappingService = await getBlindBoxProductMappingService();
        const mappings = await productMappingService.listEnabledProductMappingsForProduct(shop, productId);
        blindBoxId = mappings[0]?.blindBoxId ?? null;
      }

      if (!blindBoxId) {
        const blindBoxes = await blindBoxService.listBlindBoxes(shop);
        const match = blindBoxes.find((bb) => bb.shoplineProductId === productId);
        if (match) { blindBoxId = match.id; blindBox = match; }
      }

      if (!blindBoxId) {
        const allBoxes = await blindBoxService.listBlindBoxes(shop);
        const activeBox = allBoxes.find((bb) => bb.status === 'active');
        if (activeBox) { blindBoxId = activeBox.id; blindBox = activeBox; }
      }

      if (!blindBoxId) throw new ValidationError('No active blind box found for this product');
      if (!blindBox) blindBox = await blindBoxService.getBlindBox(shop, blindBoxId);
      if (!blindBox) throw new ValidationError('Blind box not found');

      // Check idempotency — already assigned for this cart?
      const idempotencyKey = `cart:${shop}:${cartToken}:${productId}`;
      const existing = await assignmentService.findAssignmentByOrderLine(shop, cartToken, productId).catch(() => null);
      if (existing) {
        res.status(200).send({
          success: true,
          data: {
            assignmentId: existing.id,
            label: existing.selectedRewardTitleSnapshot,
            sourceProductId: existing.selectedRewardProductId,
            sourceVariantId: existing.selectedRewardVariantId,
            cartToken,
            alreadyAssigned: true,
          },
        });
        return;
      }

      // Select item
      const poolItems = await poolItemService.listPoolItems(shop, blindBoxId);
      const eligible = getEligiblePoolItems(poolItems);
      if (eligible.length === 0) throw new ValidationError('No items available in this blind box pool');

      const selected = selectPoolItemForBlindBox(blindBox, poolItems, { random: Math.random });

      // Decrement pool item inventory
      await poolItemService.decrementInventory(shop, selected);

      // Store assignment
      const assignment = await assignmentService.createAssignment(shop, {
        blindBoxId,
        orderId: cartToken,
        orderLineId: productId,
        selectedPoolItemId: selected.id,
        selectedRewardProductId: selected.sourceProductId,
        selectedRewardVariantId: selected.sourceVariantId,
        selectedRewardTitleSnapshot: selected.label,
        status: 'assigned',
        idempotencyKey,
      });

      res.status(200).send({
        success: true,
        data: {
          assignmentId: assignment.id,
          label: selected.label,
          sourceProductId: selected.sourceProductId,
          sourceVariantId: selected.sourceVariantId,
          inventoryRemaining: Math.max(0, selected.inventoryQuantity - 1),
          cartToken,
          alreadyAssigned: false,
        },
      });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  router.options('/pool-preview', (_req, res) => {
    setStorefrontHeaders(res);
    res.status(204).send();
  });

  router.get('/pool-preview', async (req, res) => {
    setStorefrontHeaders(res);
    const context = createRequestContext({
      requestId: getRequestIdFromHeaders(req.headers),
      shop: normalizeShopHandle(req.query.shop) || 'storefront',
    });

    try {
      const shop = normalizeShopHandle(req.query.shop);
      const productId = normalizeOptionalString(req.query.productId);

      if (!shop) throw new ValidationError('Missing required query parameter: shop');
      if (!productId) throw new ValidationError('Missing required query parameter: productId');

      const blindBoxService = await getBlindBoxService();
      const blindBoxDiscoveryService = await getBlindBoxDiscoveryService();
      const poolItemService = await getBlindBoxPoolItemService();
      const catalogService = await getShoplineCatalogService();

      // Resolve blind box via tag-based discovery first, then fall back to mapping
      let blindBoxId: string | null = null;

      const product = await catalogService.getProduct(shop, productId).catch(() => null);
      if (product && isBlindBoxProduct(product)) {
        const bb = await blindBoxDiscoveryService.ensureBlindBoxForDetectedProduct(shop, product).catch(() => null);
        if (bb) blindBoxId = bb.id;
      }

      if (!blindBoxId) {
        const productMappingService = await getBlindBoxProductMappingService();
        const mappings = await productMappingService.listEnabledProductMappingsForProduct(shop, productId);
        blindBoxId = mappings[0]?.blindBoxId ?? null;
      }

      if (!blindBoxId) {
        const blindBoxes = await blindBoxService.listBlindBoxes(shop);
        const match = blindBoxes.find((bb) => bb.shoplineProductId === productId);
        if (match) blindBoxId = match.id;
      }

      if (!blindBoxId) {
        const allBoxes = await blindBoxService.listBlindBoxes(shop);
        const activeBox = allBoxes.find((bb) => bb.status === 'active');
        if (activeBox) blindBoxId = activeBox.id;
      }

      if (!blindBoxId) {
        res.status(200).send({ success: true, data: { items: [], blindBoxId: null } });
        return;
      }

      const blindBox = await blindBoxService.getBlindBox(shop, blindBoxId);
      const poolItems = await poolItemService.listPoolItems(shop, blindBoxId);

      const items = poolItems
        .filter((item) => item.enabled && item.inventoryQuantity > 0)
        .map((item) => ({
          id: item.id,
          label: item.label,
          sourceProductId: item.sourceProductId,
          sourceVariantId: item.sourceVariantId,
          inventoryQuantity: item.inventoryQuantity,
          weight: item.weight,
        }));

      res.status(200).send({
        success: true,
        data: {
          blindBoxId,
          blindBoxName: blindBox?.name ?? null,
          blindBoxDescription: blindBox?.description ?? null,
          selectionStrategy: blindBox?.selectionStrategy ?? null,
          items,
        },
      });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  return router;
}
