import express, { Request, Response } from 'express';
import {
  CreateBlindBoxInput,
  UpsertBlindBoxPoolItemInput,
  UpsertBlindBoxProductMappingInput,
} from '../../../domain/blind-box/types';
import { getBlindBoxService } from '../../../service/blind-box/blind-box-service';
import { getBlindBoxActivationReadinessService } from '../../../service/blind-box/blind-box-activation-readiness-service';
import { getBlindBoxPoolItemService } from '../../../service/blind-box/pool-item-service';
import { getBlindBoxProductMappingService } from '../../../service/blind-box/product-mapping-service';
import { getBlindBoxAssignmentService } from '../../../service/blind-box/assignment-service';
import { getInventoryOperationService } from '../../../service/inventory/inventory-operation-service';
import { getInventoryExecutionService } from '../../../service/inventory/inventory-execution-service';
import { getInventoryExecutionReadinessService } from '../../../service/inventory/inventory-execution-readiness-service';
import { getInventoryStoreDebugService } from '../../../service/inventory/inventory-store-debug-service';
import { parseJsonBody, sendErrorResponse } from '../../../lib/http';
import { createRequestContext, getRequestIdFromHeaders } from '../../../lib/request-context';
import { requireShopSession } from '../../../lib/shop-session';
import { getWebhookEventService } from '../../../service/webhook/webhook-event-service';
import { ValidationError } from '../../../lib/errors';

async function validateStorefrontProductMappingInput(
  shop: string,
  accessToken: string | undefined,
  payload: UpsertBlindBoxProductMappingInput,
): Promise<void> {
  const inventoryStoreDebugService = await getInventoryStoreDebugService();
  const product = await inventoryStoreDebugService.getProduct(shop, payload.productId, {
    accessToken,
  });

  if (!payload.productVariantId) {
    if (product.variants.length > 1) {
      throw new ValidationError(
        'A storefront blind-box variant id is required when the sold product has multiple variants.',
      );
    }

    return;
  }

  const variantExists = product.variants.some(
    (variant) => variant.variantId === payload.productVariantId,
  );
  if (!variantExists) {
    throw new ValidationError(
      'The provided storefront blind-box variant id does not belong to the selected SHOPLINE product.',
    );
  }
}

function getContext(req: Request, res: Response) {
  const shopSession = requireShopSession(res);
  return createRequestContext({
    requestId: getRequestIdFromHeaders(req.headers),
    shop: shopSession.shop,
  });
}

export function createBlindBoxAdminRouter(): express.Router {
  const router = express.Router();

  router.get('/debug/locations', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop, accessToken } = requireShopSession(res);
      const inventoryStoreDebugService = await getInventoryStoreDebugService();
      const data = await inventoryStoreDebugService.listLocations(shop, {
        accessToken,
      });

      res.status(200).send({
        success: true,
        data,
      });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  router.get('/debug/products/:productId', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop, accessToken } = requireShopSession(res);
      const inventoryStoreDebugService = await getInventoryStoreDebugService();
      const data = await inventoryStoreDebugService.getProduct(shop, req.params.productId, {
        accessToken,
      });

      res.status(200).send({
        success: true,
        data,
      });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  router.get('/debug/variants/:variantId/inventory', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop, accessToken } = requireShopSession(res);
      const inventoryStoreDebugService = await getInventoryStoreDebugService();
      const data = await inventoryStoreDebugService.getVariantInventory(shop, req.params.variantId, {
        accessToken,
      });

      res.status(200).send({
        success: true,
        data,
      });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  router.get('/pools', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop } = requireShopSession(res);
      const blindBoxService = await getBlindBoxService();
      const data = await blindBoxService.listBlindBoxes(shop);

      res.status(200).send({
        success: true,
        data,
      });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  router.post('/pools', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop } = requireShopSession(res);
      const blindBoxService = await getBlindBoxService();
      const payload = parseJsonBody<CreateBlindBoxInput>(req.body);
      if (payload.status === 'active') {
        throw new ValidationError(
          'Create new blind boxes as draft first. Add the sold product mapping and at least one ready pool item before activation.',
        );
      }
      const data = await blindBoxService.createBlindBox(shop, payload);

      res.status(201).send({
        success: true,
        data,
      });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  router.put('/pools/:blindBoxId', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop, accessToken } = requireShopSession(res);
      const blindBoxService = await getBlindBoxService();
      const blindBoxActivationReadinessService = await getBlindBoxActivationReadinessService();
      const payload = parseJsonBody<CreateBlindBoxInput>(req.body);
      if (payload.status === 'active') {
        await blindBoxActivationReadinessService.assertReadyForActivation(
          shop,
          req.params.blindBoxId,
          {
            accessToken,
          },
        );
      }
      const data = await blindBoxService.updateBlindBox(shop, req.params.blindBoxId, payload);

      res.status(200).send({
        success: true,
        data,
      });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  router.get('/pools/:blindBoxId/items', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop } = requireShopSession(res);
      const poolItemService = await getBlindBoxPoolItemService();
      const data = await poolItemService.listPoolItems(shop, req.params.blindBoxId);

      res.status(200).send({
        success: true,
        data,
      });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  router.post('/pools/:blindBoxId/items', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop } = requireShopSession(res);
      const payload = parseJsonBody<UpsertBlindBoxPoolItemInput>(req.body);
      const poolItemService = await getBlindBoxPoolItemService();
      const data = await poolItemService.upsertPoolItem(
        shop,
        {
          ...(payload || {}),
          blindBoxId: req.params.blindBoxId,
        } as UpsertBlindBoxPoolItemInput,
      );

      res.status(200).send({
        success: true,
        data,
      });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  router.get('/product-mappings', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop } = requireShopSession(res);
      const productMappingService = await getBlindBoxProductMappingService();
      const data = await productMappingService.listProductMappings(shop);

      res.status(200).send({
        success: true,
        data,
      });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  router.post('/product-mappings', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop, accessToken } = requireShopSession(res);
      const productMappingService = await getBlindBoxProductMappingService();
      const payload = parseJsonBody<UpsertBlindBoxProductMappingInput>(req.body);
      await validateStorefrontProductMappingInput(shop, accessToken, payload);
      const data = await productMappingService.upsertProductMapping(shop, payload);

      res.status(200).send({
        success: true,
        data,
      });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  router.get('/assignments', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop } = requireShopSession(res);
      const assignmentService = await getBlindBoxAssignmentService();
      const data = await assignmentService.listAssignments(shop);

      res.status(200).send({
        success: true,
        data,
      });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  router.get('/inventory-operations', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop } = requireShopSession(res);
      const inventoryOperationService = await getInventoryOperationService();
      const data = await inventoryOperationService.listInventoryOperations(shop);

      res.status(200).send({
        success: true,
        data,
      });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  router.post('/inventory-operations/:operationId/retry', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop, accessToken } = requireShopSession(res);
      const inventoryExecutionService = await getInventoryExecutionService();
      const data = await inventoryExecutionService.retryInventoryOperation(shop, req.params.operationId, {
        accessToken,
      });

      res.status(200).send({
        success: true,
        data,
      });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  router.get('/inventory-operations/:operationId/execution-readiness', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop, accessToken } = requireShopSession(res);
      const inventoryExecutionReadinessService = await getInventoryExecutionReadinessService();
      const data = await inventoryExecutionReadinessService.validateInventoryOperationExecutionReadiness(
        shop,
        req.params.operationId,
        {
          accessToken,
        },
      );

      res.status(200).send({
        success: true,
        data,
      });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  router.get('/pool-items/:poolItemId/execution-readiness', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop, accessToken } = requireShopSession(res);
      const inventoryExecutionReadinessService = await getInventoryExecutionReadinessService();
      const data = await inventoryExecutionReadinessService.validatePoolItemExecutionReadiness(
        shop,
        req.params.poolItemId,
        {
          accessToken,
        },
      );

      res.status(200).send({
        success: true,
        data,
      });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  router.get('/webhook-events', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop } = requireShopSession(res);
      const webhookEventService = await getWebhookEventService();
      const data = await webhookEventService.listWebhookEvents(shop, {
        status: typeof req.query.status === 'string' ? (req.query.status as any) : undefined,
        topic: typeof req.query.topic === 'string' ? req.query.topic : undefined,
      });

      res.status(200).send({
        success: true,
        data,
      });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  return router;
}
