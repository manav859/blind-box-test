import express from 'express';
import { BlindBoxProductMapping } from '../../domain/blind-box/types';
import { ValidationError } from '../../lib/errors';
import { sendErrorResponse } from '../../lib/http';
import { createRequestContext, getRequestIdFromHeaders } from '../../lib/request-context';
import { getBlindBoxService } from '../../service/blind-box/blind-box-service';
import { getBlindBoxProductMappingService } from '../../service/blind-box/product-mapping-service';

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
      const mappings = await productMappingService.listEnabledProductMappingsForProduct(shop, productId);
      const selectedMapping = selectPreferredMapping(mappings, productVariantId);

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

      const blindBox = await blindBoxService.getBlindBox(shop, selectedMapping.blindBoxId);
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

  return router;
}
