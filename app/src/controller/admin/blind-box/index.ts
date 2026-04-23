import express, { Request, Response } from 'express';
import {
  CreateBlindBoxInput,
  UpsertBlindBoxRewardGroupLinkInput,
  UpsertBlindBoxPoolItemInput,
  UpsertBlindBoxProductMappingInput,
  UpsertRewardGroupInput,
} from '../../../domain/blind-box/types';
import { getBlindBoxService } from '../../../service/blind-box/blind-box-service';
import { getBlindBoxActivationReadinessService } from '../../../service/blind-box/blind-box-activation-readiness-service';
import { getBlindBoxDiscoveryService } from '../../../service/blind-box/blind-box-discovery-service';
import { getBlindBoxRewardGroupLinkService } from '../../../service/blind-box/blind-box-reward-group-link-service';
import { getBlindBoxPoolItemService } from '../../../service/blind-box/pool-item-service';
import { getBlindBoxProductMappingService } from '../../../service/blind-box/product-mapping-service';
import { getRewardCandidateService } from '../../../service/blind-box/reward-candidate-service';
import { getRewardGroupService } from '../../../service/blind-box/reward-group-service';
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
import { getShoplineCatalogService } from '../../../service/shopline/catalog-service';
import { getBlindBoxDatabase } from '../../../db/client';

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

function mergeBlindBoxSettingsInput(
  existingBlindBox: CreateBlindBoxInput,
  payload: CreateBlindBoxInput,
  productTitleSnapshot?: string | null,
): CreateBlindBoxInput {
  return {
    name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : existingBlindBox.name,
    description:
      payload.description === undefined ? existingBlindBox.description || null : payload.description,
    status: payload.status || existingBlindBox.status,
    selectionStrategy: payload.selectionStrategy || existingBlindBox.selectionStrategy,
    shoplineProductId: payload.shoplineProductId !== undefined ? payload.shoplineProductId : (existingBlindBox.shoplineProductId || null),
    shoplineVariantId: payload.shoplineVariantId !== undefined ? payload.shoplineVariantId : (existingBlindBox.shoplineVariantId || null),
    productTitleSnapshot: productTitleSnapshot || existingBlindBox.productTitleSnapshot || null,
    configJson: payload.configJson === undefined ? existingBlindBox.configJson || null : payload.configJson,
  };
}

async function validateRewardGroupInput(
  shop: string,
  accessToken: string | undefined,
  payload: UpsertRewardGroupInput,
): Promise<UpsertRewardGroupInput> {
  const catalogService = await getShoplineCatalogService();
  const collection = await catalogService.getCollection(shop, payload.shoplineCollectionId, {
    accessToken,
  });

  return {
    ...payload,
    collectionTitleSnapshot: payload.collectionTitleSnapshot || collection.title || null,
  };
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

  router.get('/debug/collections/:collectionId', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop, accessToken } = requireShopSession(res);
      const catalogService = await getShoplineCatalogService();
      const data = await catalogService.listAllCollectionProducts(shop, req.params.collectionId, {
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

  // ── Dashboard stats ────────────────────────────────────────────────────────
  router.get('/stats', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop } = requireShopSession(res);
      const db = await getBlindBoxDatabase();

      const [blindBoxRows, assignmentRows, webhookRows, recentAssignments] = await Promise.all([
        db.all<{ status: string; count: string }>(
          'SELECT status, COUNT(*) as count FROM blind_boxes WHERE shop = ? GROUP BY status',
          [shop],
        ),
        db.all<{ status: string; count: string }>(
          'SELECT status, COUNT(*) as count FROM blind_box_assignments WHERE shop = ? GROUP BY status',
          [shop],
        ),
        db.all<{ status: string; count: string }>(
          'SELECT status, COUNT(*) as count FROM webhook_events WHERE shop = ? GROUP BY status',
          [shop],
        ),
        db.all<{
          id: string;
          order_id: string;
          status: string;
          selected_reward_title_snapshot: string | null;
          created_at: string;
        }>(
          'SELECT id, order_id, status, selected_reward_title_snapshot, created_at FROM blind_box_assignments WHERE shop = ? ORDER BY created_at DESC LIMIT 10',
          [shop],
        ),
      ]);

      const totalBlindBoxes = blindBoxRows.reduce((sum, r) => sum + parseInt(r.count, 10), 0);
      const activeBlindBoxes = parseInt(blindBoxRows.find((r) => r.status === 'active')?.count ?? '0', 10);
      const totalAssignments = assignmentRows.reduce((sum, r) => sum + parseInt(r.count, 10), 0);
      const failedAssignments = parseInt(
        assignmentRows.find((r) => r.status === 'inventory_failed')?.count ?? '0',
        10,
      );
      const webhookProcessed = parseInt(webhookRows.find((r) => r.status === 'processed')?.count ?? '0', 10);
      const webhookFailed = parseInt(webhookRows.find((r) => r.status === 'failed')?.count ?? '0', 10);

      res.status(200).send({
        success: true,
        data: {
          totalBlindBoxes,
          activeBlindBoxes,
          totalAssignments,
          failedAssignments,
          webhookProcessed,
          webhookFailed,
          recentAssignments: recentAssignments.map((r) => ({
            id: r.id,
            orderId: r.order_id,
            status: r.status,
            rewardTitle: r.selected_reward_title_snapshot,
            createdAt: r.created_at,
          })),
        },
      });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  // ── Catalog: products & collections for pickers ────────────────────────────
  router.get('/catalog/products', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop, accessToken } = requireShopSession(res);
      const catalogService = await getShoplineCatalogService();
      const result = await catalogService.listAllProducts(shop, { accessToken });

      res.status(200).send({
        success: true,
        data: result.products.map((p) => ({
          id: p.id,
          title: p.title,
          status: p.status,
          published: p.published,
          tags: p.tags ?? [],
          variantCount: p.variants.length,
          variants: p.variants.map((v) => ({
            id: v.id,
            title: v.title,
            sku: v.sku,
            inventoryQuantity: v.inventoryQuantity,
          })),
        })),
      });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  router.get('/catalog/collections', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop, accessToken } = requireShopSession(res);
      const catalogService = await getShoplineCatalogService();
      const result = await catalogService.listAllCollections(shop, { accessToken });

      res.status(200).send({
        success: true,
        data: result.collections.map((c) => ({
          id: c.id,
          title: c.title,
          handle: c.handle,
          status: c.status,
        })),
      });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  // ── Single blind box ───────────────────────────────────────────────────────
  router.get('/pools/:blindBoxId', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop } = requireShopSession(res);
      const blindBoxService = await getBlindBoxService();
      const blindBoxRewardGroupLinkService = await getBlindBoxRewardGroupLinkService();
      const rewardGroupService = await getRewardGroupService();

      const blindBox = await blindBoxService.getBlindBox(shop, req.params.blindBoxId);
      if (!blindBox) {
        res.status(404).send({ success: false, error: 'Blind box not found' });
        return;
      }

      const [links, rewardGroups] = await Promise.all([
        blindBoxRewardGroupLinkService.listLinks(shop),
        rewardGroupService.listRewardGroups(shop),
      ]);

      const link = links.find((l) => l.blindBoxId === blindBox.id);
      const rewardGroup = link ? rewardGroups.find((g) => g.id === link.rewardGroupId) : null;

      res.status(200).send({
        success: true,
        data: {
          ...blindBox,
          rewardGroupLink: link ?? null,
          rewardGroup: rewardGroup ?? null,
        },
      });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  router.get('/pools', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop, accessToken } = requireShopSession(res);
      const blindBoxDiscoveryService = await getBlindBoxDiscoveryService();
      const data = await blindBoxDiscoveryService.listDetectedBlindBoxes(shop, {
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

  router.post('/pools', async (req, res) => {
    const context = getContext(req, res);

    try {
      throw new ValidationError(
        'Manual blind-box product registration is deprecated. Tag the product in SHOPLINE with "blind-box" and refresh the detected list instead.',
      );
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
      const catalogService = await getShoplineCatalogService();
      const existingBlindBox = await blindBoxService.getBlindBox(shop, req.params.blindBoxId);
      if (!existingBlindBox) {
        throw new ValidationError('Blind-box reference not found');
      }

      const payload = parseJsonBody<CreateBlindBoxInput>(req.body);
      const detectedProduct = existingBlindBox.shoplineProductId
        ? await catalogService.getProduct(shop, existingBlindBox.shoplineProductId, {
            accessToken,
          })
        : null;
      const mergedPayload = mergeBlindBoxSettingsInput(
        existingBlindBox,
        payload,
        detectedProduct?.title || existingBlindBox.productTitleSnapshot,
      );

      if (mergedPayload.status === 'active') {
        await blindBoxActivationReadinessService.assertReadyForActivation(
          shop,
          req.params.blindBoxId,
          {
            accessToken,
          },
        );
      }
      const data = await blindBoxService.updateBlindBox(shop, req.params.blindBoxId, mergedPayload);

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

  router.get('/pools/:blindBoxId/readiness', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop, accessToken } = requireShopSession(res);
      const blindBoxActivationReadinessService = await getBlindBoxActivationReadinessService();
      const data = await blindBoxActivationReadinessService.getReadinessReport(shop, req.params.blindBoxId, {
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

  router.get('/pools/:blindBoxId/reward-candidates', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop, accessToken } = requireShopSession(res);
      const rewardCandidateService = await getRewardCandidateService();
      const data = await rewardCandidateService.previewCandidatesForBlindBox(shop, req.params.blindBoxId, {
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

  router.get('/reward-groups', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop } = requireShopSession(res);
      const rewardGroupService = await getRewardGroupService();
      const data = await rewardGroupService.listRewardGroups(shop);

      res.status(200).send({
        success: true,
        data,
      });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  router.post('/reward-groups', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop, accessToken } = requireShopSession(res);
      const rewardGroupService = await getRewardGroupService();
      const payload = await validateRewardGroupInput(
        shop,
        accessToken,
        parseJsonBody<UpsertRewardGroupInput>(req.body),
      );
      const data = await rewardGroupService.upsertRewardGroup(shop, payload);

      res.status(200).send({
        success: true,
        data,
      });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  router.get('/reward-group-links', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop } = requireShopSession(res);
      const blindBoxRewardGroupLinkService = await getBlindBoxRewardGroupLinkService();
      const data = await blindBoxRewardGroupLinkService.listLinks(shop);

      res.status(200).send({
        success: true,
        data,
      });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  router.post('/reward-group-links', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop } = requireShopSession(res);
      const blindBoxRewardGroupLinkService = await getBlindBoxRewardGroupLinkService();
      const payload = parseJsonBody<UpsertBlindBoxRewardGroupLinkInput>(req.body);
      const data = await blindBoxRewardGroupLinkService.upsertLink(shop, payload);

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
