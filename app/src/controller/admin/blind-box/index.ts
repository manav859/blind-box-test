import express, { Request, Response } from 'express';
import {
  BlindBox,
  CreateBlindBoxInput,
  UpsertBlindBoxPoolItemInput,
  UpsertBlindBoxProductMappingInput,
} from '../../../domain/blind-box/types';

import { getBlindBoxService } from '../../../service/blind-box/blind-box-service';
import { getBlindBoxActivationReadinessService } from '../../../service/blind-box/blind-box-activation-readiness-service';
import { getBlindBoxPoolItemService } from '../../../service/blind-box/pool-item-service';
import { getBlindBoxProductMappingService } from '../../../service/blind-box/product-mapping-service';
import { getRewardCandidateService } from '../../../service/blind-box/reward-candidate-service';
import { getBlindBoxAssignmentService } from '../../../service/blind-box/assignment-service';
import { getInventoryOperationService } from '../../../service/inventory/inventory-operation-service';
import { getInventoryExecutionService } from '../../../service/inventory/inventory-execution-service';
import { getInventoryExecutionReadinessService } from '../../../service/inventory/inventory-execution-readiness-service';
import { getInventoryStoreDebugService } from '../../../service/inventory/inventory-store-debug-service';
import { parseJsonBody, sendErrorResponse } from '../../../lib/http';
import { createRequestContext, getRequestIdFromHeaders } from '../../../lib/request-context';
import { requireShopSession } from '../../../lib/shop-session';
import { getWebhookEventService } from '../../../service/webhook/webhook-event-service';
import { getPaidOrderWebhookService } from '../../../service/webhook/paid-order-webhook-service';
import { ValidationError } from '../../../lib/errors';
import { getShoplineCatalogService } from '../../../service/shopline/catalog-service';
import { getBlindBoxDatabase } from '../../../db/client';
import { getUploadedImageRepository } from '../../../repository/uploaded-image-repository';
import { logger } from '../../../lib/logger';
import type { OrderPaidWebhookPayload } from '../../../domain/blind-box/order-paid';
import type { IncomingHttpHeaders } from 'http';

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
  existingBlindBox: BlindBox,
  payload: CreateBlindBoxInput,
  triggerProductTitleSnapshot?: string | null,
): CreateBlindBoxInput {
  return {
    name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : existingBlindBox.name,
    description:
      payload.description === undefined ? existingBlindBox.description || null : payload.description,
    status: payload.status || existingBlindBox.status,
    triggerProductId:
      payload.triggerProductId !== undefined
        ? payload.triggerProductId
        : existingBlindBox.triggerProductId || null,
    triggerProductTitleSnapshot:
      triggerProductTitleSnapshot || existingBlindBox.triggerProductTitleSnapshot || null,
    configJson: payload.configJson === undefined ? existingBlindBox.configJson || null : payload.configJson,
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

      const fetchedCount = result.products.length;
      const detectedCount = result.products.filter((p) => (p.tags ?? []).includes('blind-box')).length;

      // Log a raw sample (first product) so Render logs show the exact field shapes.
      if (result.products.length > 0) {
        const sample = result.products[0];
        const rawSample = sample.raw as Record<string, unknown>;
        logger.info('SHOPLINE product sample (first of page)', {
          shop,
          fetchedCount,
          detectedCount,
          sample: {
            id: sample.id,
            title: sample.title,
            status: sample.status,
            published: sample.published,
            variantCount: sample.variants.length,
            tagsNormalized: sample.tags,
            tagsRaw: rawSample?.tags,
            tagListRaw: rawSample?.tag_list ?? rawSample?.tagList,
            labelsRaw: rawSample?.labels,
          },
        });
      } else {
        logger.warn('SHOPLINE returned 0 products', { shop });
      }

      res.status(200).send({
        success: true,
        data: result.products.map((p) => ({
          id: p.id,
          title: p.title,
          status: p.status,
          published: p.published,
          imageUrl: p.imageUrl,
          tags: p.tags ?? [],
          variantCount: p.variants.length,
          variants: p.variants.map((v) => ({
            id: v.id,
            title: v.title,
            sku: v.sku,
            inventoryQuantity: v.inventoryQuantity,
          })),
        })),
        debug: { fetchedCount, detectedCount },
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'CatalogGatewayError') {
        const gwErr = error as Error & { code: string; statusCode: number; details?: Record<string, unknown> };
        res.status(200).send({
          success: true,
          data: [],
          warning: {
            code: gwErr.code,
            message: gwErr.message,
            shoplineStatus: gwErr.statusCode,
            hint: 'SHOPLINE product API unavailable. Tag a product "blind-box" in SHOPLINE Admin and try again.',
          },
        });
        return;
      }
      sendErrorResponse(res, error, context);
    }
  });

  // Single product by ID — returns full tag list (needed by the detail page).
  router.get('/catalog/products/:productId', async (req, res) => {
    const context = getContext(req, res);
    try {
      const { shop, accessToken } = requireShopSession(res);
      const catalogService = await getShoplineCatalogService();
      const product = await catalogService.getProduct(shop, req.params.productId, { accessToken });
      res.status(200).send({
        success: true,
        data: {
          id: product.id,
          title: product.title,
          status: product.status,
          published: product.published,
          imageUrl: product.imageUrl,
          tags: product.tags ?? [],
          variantCount: product.variants.length,
          variants: product.variants.map((v) => ({
            id: v.id,
            title: v.title,
            sku: v.sku,
            inventoryQuantity: v.inventoryQuantity,
          })),
        },
      });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  // Lists SHOPLINE locations (read_location) so the operator can find the id to
  // set as BLIND_BOX_SHOPLINE_LOCATION_ID for execute-mode inventory decrements.
  router.get('/catalog/locations', async (req, res) => {
    const context = getContext(req, res);
    try {
      const { shop, accessToken } = requireShopSession(res);
      const inventoryStoreDebugService = await getInventoryStoreDebugService();
      const locations = await inventoryStoreDebugService.listLocations(shop, { accessToken });
      res.status(200).send({ success: true, data: locations });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  // ── Single blind box (with its reward pool) ─────────────────────────────────
  router.get('/pools/:blindBoxId', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop } = requireShopSession(res);
      const blindBoxService = await getBlindBoxService();
      const poolItemService = await getBlindBoxPoolItemService();

      const blindBox = await blindBoxService.getBlindBox(shop, req.params.blindBoxId);
      if (!blindBox) {
        res.status(404).send({ success: false, error: 'Blind box not found' });
        return;
      }

      const poolItems = await poolItemService.listPoolItems(shop, blindBox.id);

      res.status(200).send({
        success: true,
        data: {
          ...blindBox,
          poolItems,
        },
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

  // Create a blind box. Default path AUTO-CREATES the sellable SHOPLINE product
  // (name + price + optional image). Advanced path: link an existing product id.
  router.post('/pools', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop, accessToken } = requireShopSession(res);
      const blindBoxService = await getBlindBoxService();
      const catalogService = await getShoplineCatalogService();
      const payload = parseJsonBody<{
        name?: string;
        price?: string | number;
        description?: string | null;
        imageUrl?: string | null;
        triggerProductId?: string | null;
        triggerProductTitleSnapshot?: string | null;
      }>(req.body);

      const name = (payload.name ?? '').trim();
      if (!name) {
        throw new ValidationError('A blind box name is required.');
      }

      // ── Advanced path: link an existing product ──────────────────────────
      if (payload.triggerProductId?.trim()) {
        const triggerProductId = payload.triggerProductId.trim();
        let snapshot = payload.triggerProductTitleSnapshot ?? null;
        try {
          const product = await catalogService.getProduct(shop, triggerProductId, { accessToken });
          snapshot = product.title ?? snapshot;
        } catch {
          /* non-fatal */
        }
        const data = await blindBoxService.createBlindBox(shop, {
          name,
          description: payload.description ?? null,
          status: 'draft',
          triggerProductId,
          triggerProductTitleSnapshot: snapshot,
        });
        res.status(200).send({ success: true, data });
        return;
      }

      // ── Default path: create the sellable SHOPLINE product ───────────────
      const price = payload.price != null ? String(payload.price).trim() : '';
      if (!price || !Number.isFinite(Number(price)) || Number(price) < 0) {
        throw new ValidationError('A valid price is required to create the blind box product.');
      }

      let createdProduct;
      try {
        createdProduct = await catalogService.createProduct(
          shop,
          { title: name, price, description: payload.description ?? null, imageUrl: payload.imageUrl ?? null },
          { accessToken },
        );
      } catch (error) {
        // Never leave an orphaned blind box if product creation fails.
        throw new ValidationError(
          `Could not create the SHOPLINE product for this blind box: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      const data = await blindBoxService.createBlindBox(shop, {
        name,
        description: payload.description ?? null,
        status: 'draft',
        triggerProductId: createdProduct.id,
        triggerProductTitleSnapshot: createdProduct.title ?? name,
      });

      res.status(200).send({
        success: true,
        data,
        product: {
          id: createdProduct.id,
          title: createdProduct.title,
          imageUrl: createdProduct.imageUrl,
          adminUrl: `https://${shop}.myshopline.com/admin/products/${createdProduct.id}`,
        },
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
      const catalogService = await getShoplineCatalogService();
      const existingBlindBox = await blindBoxService.getBlindBox(shop, req.params.blindBoxId);
      if (!existingBlindBox) {
        throw new ValidationError('Blind-box reference not found');
      }

      const payload = parseJsonBody<CreateBlindBoxInput>(req.body);
      const nextTriggerProductId =
        payload.triggerProductId !== undefined ? payload.triggerProductId : existingBlindBox.triggerProductId;
      const triggerProduct = nextTriggerProductId
        ? await catalogService.getProduct(shop, nextTriggerProductId, { accessToken }).catch(() => null)
        : null;
      const mergedPayload = mergeBlindBoxSettingsInput(
        existingBlindBox,
        payload,
        triggerProduct?.title || existingBlindBox.triggerProductTitleSnapshot,
      );

      if (mergedPayload.status === 'active') {
        await blindBoxActivationReadinessService.assertReadyForActivation(shop, req.params.blindBoxId, {
          accessToken,
        });
      }
      const data = await blindBoxService.updateBlindBox(shop, req.params.blindBoxId, mergedPayload);

      // Archiving a blind box archives (never deletes) its backing SHOPLINE
      // product, so the storefront listing comes down but order history survives.
      let productNote: string | undefined;
      if (
        mergedPayload.status === 'archived' &&
        existingBlindBox.status !== 'archived' &&
        existingBlindBox.triggerProductId
      ) {
        try {
          await catalogService.archiveProduct(shop, existingBlindBox.triggerProductId, { accessToken });
        } catch (error) {
          logger.warn('Failed to archive backing SHOPLINE product for blind box', {
            shop,
            blindBoxId: existingBlindBox.id,
            productId: existingBlindBox.triggerProductId,
            error: error instanceof Error ? error.message : String(error),
          });
          productNote = 'Blind box archived, but its SHOPLINE product could not be archived automatically — archive it manually in SHOPLINE Admin.';
        }
      }

      res.status(200).send({ success: true, data, ...(productNote ? { warning: { message: productNote } } : {}) });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  // Full edit of the blind box + its backing SHOPLINE product: name, price,
  // description, image. Updates SHOPLINE first (write_products); only on
  // success does the local record update, so the two never diverge silently.
  router.put('/pools/:blindBoxId/product', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop, accessToken } = requireShopSession(res);
      const blindBoxService = await getBlindBoxService();
      const catalogService = await getShoplineCatalogService();

      const blindBox = await blindBoxService.getBlindBox(shop, req.params.blindBoxId);
      if (!blindBox) {
        throw new ValidationError('Blind-box reference not found');
      }
      if (!blindBox.triggerProductId) {
        throw new ValidationError('This blind box has no backing SHOPLINE product to edit.');
      }

      const payload = parseJsonBody<{
        name?: string;
        price?: string | number;
        description?: string | null;
        imageUrl?: string | null;
      }>(req.body);

      const nextName = (payload.name ?? '').trim();
      const nextPrice = payload.price != null ? String(payload.price).trim() : '';
      if (nextPrice && (!Number.isFinite(Number(nextPrice)) || Number(nextPrice) < 0)) {
        throw new ValidationError('Price must be a valid non-negative number.');
      }

      const updatedProduct = await catalogService.updateProduct(
        shop,
        blindBox.triggerProductId,
        {
          title: nextName || null,
          price: nextPrice || null,
          description: payload.description,
          imageUrl: payload.imageUrl ?? null,
        },
        { accessToken },
      );

      const data = await blindBoxService.updateBlindBox(shop, blindBox.id, {
        name: nextName || blindBox.name,
        description: payload.description === undefined ? blindBox.description : payload.description,
        status: blindBox.status,
        triggerProductId: blindBox.triggerProductId,
        triggerProductTitleSnapshot: updatedProduct.title ?? blindBox.triggerProductTitleSnapshot,
        configJson: blindBox.configJson,
      });

      res.status(200).send({
        success: true,
        data,
        product: { id: updatedProduct.id, title: updatedProduct.title, imageUrl: updatedProduct.imageUrl },
      });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  // ── Reward pool management (blind_box_pool_items) ───────────────────────────
  router.get('/pools/:blindBoxId/rewards', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop } = requireShopSession(res);
      const poolItemService = await getBlindBoxPoolItemService();
      const data = await poolItemService.listPoolItems(shop, req.params.blindBoxId);

      res.status(200).send({ success: true, data });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  router.post('/pools/:blindBoxId/rewards', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop, accessToken } = requireShopSession(res);
      const blindBoxService = await getBlindBoxService();
      const poolItemService = await getBlindBoxPoolItemService();
      const catalogService = await getShoplineCatalogService();
      const payload = parseJsonBody<UpsertBlindBoxPoolItemInput>(req.body);

      const blindBox = await blindBoxService.getBlindBox(shop, req.params.blindBoxId);
      if (!blindBox) {
        throw new ValidationError('Blind-box reference not found');
      }

      const rewardProductId = payload?.rewardProductId?.trim();
      if (!rewardProductId) {
        throw new ValidationError('Pick a reward product to add to the pool.');
      }
      if (blindBox.triggerProductId && rewardProductId === blindBox.triggerProductId) {
        throw new ValidationError('The trigger product cannot also be a reward in its own pool.');
      }

      // Snapshot the reward title; tolerate a catalog hiccup.
      let rewardTitleSnapshot = payload.rewardTitleSnapshot ?? null;
      try {
        const product = await catalogService.getProduct(shop, rewardProductId, { accessToken });
        rewardTitleSnapshot = product.title ?? rewardTitleSnapshot;
      } catch {
        /* non-fatal */
      }

      const data = await poolItemService.addReward(shop, {
        blindBoxId: req.params.blindBoxId,
        rewardProductId,
        rewardVariantId: payload.rewardVariantId ?? null,
        rewardTitleSnapshot,
      });

      res.status(200).send({ success: true, data });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  router.delete('/pools/:blindBoxId/rewards/:poolItemId', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop } = requireShopSession(res);
      const poolItemService = await getBlindBoxPoolItemService();
      await poolItemService.removeReward(shop, req.params.blindBoxId, req.params.poolItemId);

      res.status(200).send({ success: true, data: { id: req.params.poolItemId } });
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

  // Internal fulfillment tracking ONLY (shipped_at flag). This never calls
  // SHOPLINE's fulfillment API — the merchant fulfills the real order in
  // SHOPLINE Admin separately.
  router.post('/assignments/:assignmentId/ship', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop } = requireShopSession(res);
      const payload = parseJsonBody<{ shipped?: boolean }>(req.body);
      const assignmentService = await getBlindBoxAssignmentService();

      const existing = await assignmentService.getAssignment(shop, req.params.assignmentId);
      if (!existing) {
        res.status(404).send({ success: false, error: 'Assignment not found' });
        return;
      }

      const data = await assignmentService.setShipped(shop, existing.id, payload?.shipped !== false);
      res.status(200).send({ success: true, data });
    } catch (error) {
      sendErrorResponse(res, error, context);
    }
  });

  // Accepts a small image (base64 JSON), stores it, and returns a PUBLIC URL the
  // SHOPLINE product media can reference as original_source (SHOPLINE fetches
  // and rehosts it on its own CDN at product create/update).
  router.post('/uploads/images', async (req, res) => {
    const context = getContext(req, res);

    try {
      const { shop } = requireShopSession(res);
      const payload = parseJsonBody<{ contentType?: string; dataBase64?: string }>(req.body);

      const contentType = (payload?.contentType ?? '').trim().toLowerCase();
      const dataBase64 = (payload?.dataBase64 ?? '').trim();
      if (!/^image\/(png|jpe?g|gif|webp)$/.test(contentType)) {
        throw new ValidationError('Only PNG, JPEG, GIF, or WebP images are supported.');
      }
      if (!dataBase64) {
        throw new ValidationError('Image data is required.');
      }
      // ~4MB binary ≈ 5.4MB base64.
      if (dataBase64.length > 5_500_000) {
        throw new ValidationError('Image is too large — keep it under 4MB.');
      }

      const uploadedImageRepository = await getUploadedImageRepository();
      const image = await uploadedImageRepository.create(shop, contentType, dataBase64);

      const appUrl = (process.env.SHOPLINE_APP_URL || '').replace(/\/$/, '');
      const url = `${appUrl}/public/blind-box-images/${image.id}`;

      res.status(200).send({ success: true, data: { id: image.id, url } });
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

  // Retry a failed webhook event by re-running its stored payload.
  router.post('/webhook-events/:id/retry', async (req, res) => {

    try {
      const { shop } = requireShopSession(res);
      const webhookEventService = await getWebhookEventService();

      const event = await webhookEventService.findById(req.params.id);
      if (!event || event.shop !== shop) {
        res.status(404).send({ success: false, error: { message: 'Webhook event not found' } });
        return;
      }

      if (event.status !== 'failed') {
        res.status(400).send({
          success: false,
          error: { message: `Event is "${event.status}" — only failed events can be retried` },
        });
        return;
      }

      if (event.topic !== 'orders/paid') {
        res.status(400).send({
          success: false,
          error: { message: `Retry is only supported for orders/paid events, got "${event.topic}"` },
        });
        return;
      }

      // Reset status so processPaidOrderWebhook won't treat it as a duplicate.
      await webhookEventService.resetForRetry(shop, event.eventId);

      const paidOrderWebhookService = await getPaidOrderWebhookService();

      let parsedPayload: unknown;
      try {
        parsedPayload = JSON.parse(event.payload);
      } catch {
        res.status(400).send({ success: false, error: { message: 'Stored event payload is not valid JSON' } });
        return;
      }

      const fakeHeaders = {
        'x-shopline-shop-domain': `${shop}.myshopline.com`,
        'x-shopline-webhook-id': event.eventId,
      };

      logger.info('webhook retry started', {
        shop,
        eventId: event.eventId,
        internalId: event.id,
        topic: event.topic,
        hasPayload: Boolean(event.payload),
      });

      const result = await paidOrderWebhookService.processPaidOrderWebhook(
        fakeHeaders as unknown as IncomingHttpHeaders,
        parsedPayload as unknown as OrderPaidWebhookPayload,
      );

      const summary = result.summary as Record<string, unknown> | null;
      const assignmentCount = Array.isArray(summary?.assignments) ? (summary!.assignments as unknown[]).length : 0;
      const failureCount = Array.isArray(summary?.failures) ? (summary!.failures as unknown[]).length : 0;

      logger.info('webhook retry completed', {
        shop,
        eventId: result.eventId,
        status: result.status,
        assignmentCount,
        failureCount,
      });

      // Always 200 — business-logic failures (e.g. EMPTY_REWARD_GROUP) are not
      // server errors; the caller reads result.status to know if it succeeded.
      res.status(200).json({
        ok: result.shouldAcknowledge,
        eventId: result.eventId,
        status: result.status,
        assignmentCount,
        failureCount,
        summary: result.summary,
      });
    } catch (error) {
      const appErr = error instanceof Error ? error : new Error(String(error));
      logger.error('webhook retry failed', {
        shop: (res.locals?.shopline?.session?.handle as string | undefined) ?? 'unknown',
        error: appErr.message,
        stack: appErr.stack?.split('\n').slice(0, 5).join(' | '),
      });

      // Return structured JSON even for unexpected errors — frontend can show message.
      res.status(200).json({
        ok: false,
        eventId: req.params.id,
        status: 'error',
        errorCode: 'RETRY_INTERNAL_ERROR',
        message: appErr.message,
      });
    }
  });

  return router;
}
