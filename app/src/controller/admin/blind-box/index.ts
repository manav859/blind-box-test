import express, { Request, Response } from 'express';
import {
  CreateBlindBoxInput,
  UpsertBlindBoxPoolItemInput,
  UpsertBlindBoxProductMappingInput,
} from '../../../domain/blind-box/types';
import { getBlindBoxService } from '../../../service/blind-box/blind-box-service';
import { getBlindBoxPoolItemService } from '../../../service/blind-box/pool-item-service';
import { getBlindBoxProductMappingService } from '../../../service/blind-box/product-mapping-service';
import { getBlindBoxAssignmentService } from '../../../service/blind-box/assignment-service';
import { getInventoryOperationService } from '../../../service/inventory/inventory-operation-service';
import { parseJsonBody, sendErrorResponse } from '../../../lib/http';
import { createRequestContext, getRequestIdFromHeaders } from '../../../lib/request-context';
import { requireShopSession } from '../../../lib/shop-session';

function getContext(req: Request, res: Response) {
  const shopSession = requireShopSession(res);
  return createRequestContext({
    requestId: getRequestIdFromHeaders(req.headers),
    shop: shopSession.shop,
  });
}

export function createBlindBoxAdminRouter(): express.Router {
  const router = express.Router();

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
      const data = await blindBoxService.createBlindBox(shop, payload);

      res.status(201).send({
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
      const { shop } = requireShopSession(res);
      const productMappingService = await getBlindBoxProductMappingService();
      const payload = parseJsonBody<UpsertBlindBoxProductMappingInput>(req.body);
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

  return router;
}
