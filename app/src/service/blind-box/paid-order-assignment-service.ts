import {
  BlindBox,
  BlindBoxPoolItem,
  BlindBoxProductMapping,
  InventoryOperation,
  RewardCandidate,
} from '../../domain/blind-box/types';
import { OrderPaidLineItem, OrderPaidWebhookPayload } from '../../domain/blind-box/order-paid';
import {
  BlindBoxOrderDetectionResult,
  detectBlindBoxOrderLines,
} from '../../domain/blind-box/order-detection';
import { isBlindBoxProduct } from '../../domain/blind-box/product-detection';
import { evaluateEligiblePoolItems, selectPoolItemForBlindBox } from '../../domain/blind-box/selection';
import { ValidationError } from '../../lib/errors';
import { logger, Logger } from '../../lib/logger';
import { BlindBoxRepository, getBlindBoxRepository } from '../../repository/blind-box-repository';
import {
  BlindBoxPoolItemRepository,
  getBlindBoxPoolItemRepository,
} from '../../repository/blind-box-pool-item-repository';
import {
  BlindBoxProductMappingRepository,
  getBlindBoxProductMappingRepository,
} from '../../repository/blind-box-product-mapping-repository';
import {
  BlindBoxAssignmentRepository,
  getBlindBoxAssignmentRepository,
} from '../../repository/blind-box-assignment-repository';
import {
  getInventoryExecutionService,
  InventoryExecutionResult,
  InventoryExecutionService,
} from '../inventory/inventory-execution-service';
import {
  AssignmentInventoryBoundaryService,
  getAssignmentInventoryBoundaryService,
} from '../inventory/assignment-inventory-boundary-service';
import { getRuntimeConfig } from '../../lib/config';
import {
  getRewardCandidateService,
  RewardCandidateResolutionError,
  RewardCandidateService,
} from './reward-candidate-service';
import {
  BlindBoxDiscoveryService,
  getBlindBoxDiscoveryService,
} from './blind-box-discovery-service';
import { getShoplineCatalogService, ShoplineCatalogService } from '../shopline/catalog-service';
import { getOrderLineItems } from '../../domain/blind-box/order-paid';

export type AssignmentFailureReason =
  | 'BLIND_BOX_NOT_ACTIVE'
  | 'REWARD_GROUP_NOT_LINKED'
  | 'REWARD_COLLECTION_NOT_CONFIGURED'
  | 'REWARD_COLLECTION_NOT_FOUND'
  | 'EMPTY_REWARD_GROUP'
  | 'NO_ELIGIBLE_REWARDS'
  | 'EMPTY_POOL'
  | 'NO_ELIGIBLE_ITEMS'
  | 'UNSUPPORTED_QUANTITY'
  | 'INVALID_WEIGHTING'
  | 'INVENTORY_WORKFLOW_FAILURE'
  | 'INVENTORY_REQUIRES_RECONCILIATION';

export interface AssignmentProcessingFailure {
  blindBoxId: string;
  lineItemId: string;
  orderId: string;
  reason: AssignmentFailureReason;
  message: string;
}

export interface AssignedBlindBoxOrderLine {
  blindBoxId: string;
  lineItemId: string;
  orderId: string;
  assignmentId: string;
  selectedPoolItemId: string | null;
  selectedRewardProductId: string | null;
  selectedRewardVariantId: string | null;
  selectedRewardTitleSnapshot: string | null;
  selectionStrategy: BlindBox['selectionStrategy'];
  inventoryOperationId: string;
  inventoryStatus: InventoryOperation['status'];
  wasExistingAssignment: boolean;
}

export interface PaidOrderProcessingSummary {
  detectedLineCount: number;
  matchedLineCount: number;
  ignoredDetections: BlindBoxOrderDetectionResult[];
  assignments: AssignedBlindBoxOrderLine[];
  failures: AssignmentProcessingFailure[];
}

export interface PaidOrderAssignmentServiceDependencies {
  blindBoxRepository: BlindBoxRepository;
  blindBoxPoolItemRepository: BlindBoxPoolItemRepository;
  blindBoxProductMappingRepository: BlindBoxProductMappingRepository;
  blindBoxAssignmentRepository: BlindBoxAssignmentRepository;
  blindBoxDiscoveryService: BlindBoxDiscoveryService;
  catalogService: ShoplineCatalogService;
  rewardCandidateService: RewardCandidateService;
  assignmentInventoryBoundaryService: AssignmentInventoryBoundaryService;
  inventoryExecutionService: InventoryExecutionService;
  logger: Logger;
  random: () => number;
  inventoryExecutionMode: 'deferred' | 'execute';
}

function createIdempotencyKey(shop: string, orderId: string, orderLineId: string): string {
  return `${shop}:${orderId}:${orderLineId}`;
}

function summarizeLineItem(lineItem: OrderPaidLineItem): Record<string, unknown> {
  return {
    id: lineItem.id,
    productId: lineItem.product_id,
    variantId: lineItem.variant_id || null,
    quantity: lineItem.quantity ?? 1,
    title: lineItem.title || null,
  };
}

function toAssignmentFailure(
  blindBoxId: string,
  lineItemId: string,
  orderId: string,
  reason: AssignmentFailureReason,
  message: string,
): AssignmentProcessingFailure {
  return {
    blindBoxId,
    lineItemId,
    orderId,
    reason,
    message,
  };
}

function toAssignedBlindBoxOrderLine(
  executionResult: {
    assignmentId: string;
    blindBoxId: string;
    selectedPoolItemId: string | null;
    selectedRewardProductId: string | null;
    selectedRewardVariantId: string | null;
    selectedRewardTitleSnapshot: string | null;
    selectionStrategy: BlindBox['selectionStrategy'];
    inventoryOperationId: string;
    inventoryStatus: InventoryOperation['status'];
    lineItemId: string;
    orderId: string;
    wasExistingAssignment: boolean;
  },
): AssignedBlindBoxOrderLine {
  return {
    blindBoxId: executionResult.blindBoxId,
    lineItemId: executionResult.lineItemId,
    orderId: executionResult.orderId,
    assignmentId: executionResult.assignmentId,
    selectedPoolItemId: executionResult.selectedPoolItemId,
    selectedRewardProductId: executionResult.selectedRewardProductId,
    selectedRewardVariantId: executionResult.selectedRewardVariantId,
    selectedRewardTitleSnapshot: executionResult.selectedRewardTitleSnapshot,
    selectionStrategy: executionResult.selectionStrategy,
    inventoryOperationId: executionResult.inventoryOperationId,
    inventoryStatus: executionResult.inventoryStatus,
    wasExistingAssignment: executionResult.wasExistingAssignment,
  };
}

function toSyntheticBlindBoxReferenceMapping(blindBox: BlindBox): BlindBoxProductMapping | null {
  if (!blindBox.shoplineProductId) {
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

function selectRewardCandidate(
  blindBox: BlindBox,
  candidates: RewardCandidate[],
  random: () => number,
): RewardCandidate {
  if (!candidates.length) {
    throw new ValidationError('No eligible reward candidates are available for this blind box');
  }

  if (blindBox.selectionStrategy === 'weighted') {
    const totalWeight = candidates.reduce((sum, candidate) => {
      if (!Number.isFinite(candidate.selectionWeight) || candidate.selectionWeight <= 0) {
        throw new ValidationError('Weighted selection requires every reward candidate to have a positive weight');
      }

      return sum + candidate.selectionWeight;
    }, 0);

    let threshold = random() * totalWeight;
    for (const candidate of candidates) {
      threshold -= candidate.selectionWeight;
      if (threshold < 0) {
        return candidate;
      }
    }

    return candidates[candidates.length - 1];
  }

  const index = Math.floor(random() * candidates.length);
  return candidates[Math.min(index, candidates.length - 1)];
}

export class PaidOrderAssignmentService {
  constructor(private readonly dependencies: PaidOrderAssignmentServiceDependencies) {}

  async processPaidOrder(shop: string, payload: OrderPaidWebhookPayload): Promise<PaidOrderProcessingSummary> {
    const detectionMappings = await this.loadOrderDetectionMappings(shop);
    const productCache = await this.loadProductCache(shop, payload);
    const detections: BlindBoxOrderDetectionResult[] = [];

    for (const lineItem of getOrderLineItems(payload)) {
      detections.push(await this.detectBlindBoxOrderLine(shop, lineItem, detectionMappings, productCache));
    }

    const matchedDetections = detections.filter((result) => result.reason === 'BLIND_BOX_MATCH');
    const ignoredDetections = detections.filter((result) => result.reason !== 'BLIND_BOX_MATCH');

    const assignments: AssignedBlindBoxOrderLine[] = [];
    const failures: AssignmentProcessingFailure[] = [];

    for (const detection of matchedDetections) {
      const mapping = detection.mapping as BlindBoxProductMapping;
      const outcome = await this.processMatchedBlindBoxLine(shop, payload.id, mapping, detection.lineItem);

      if ('reason' in outcome) {
        failures.push(outcome);
      } else {
        assignments.push(outcome);
      }
    }

    return {
      detectedLineCount: detections.length,
      matchedLineCount: matchedDetections.length,
      ignoredDetections,
      assignments,
      failures,
    };
  }

  private async loadProductCache(
    shop: string,
    payload: OrderPaidWebhookPayload,
  ): Promise<Map<string, Awaited<ReturnType<ShoplineCatalogService['getProduct']>> | null>> {
    const productIds = [...new Set(getOrderLineItems(payload).map((lineItem) => lineItem.product_id).filter(Boolean))];
    const entries = await Promise.all(
      productIds.map(async (productId) => {
        try {
          const product = await this.dependencies.catalogService.getProduct(shop, productId);
          return [productId, product] as const;
        } catch (error) {
          this.dependencies.logger.warn('Failed to load SHOPLINE product during blind-box order detection; falling back to legacy mappings', {
            shop,
            productId,
            error: error instanceof Error ? error.message : String(error),
          });
          return [productId, null] as const;
        }
      }),
    );

    return new Map(entries);
  }

  private async detectBlindBoxOrderLine(
    shop: string,
    lineItem: OrderPaidLineItem,
    detectionMappings: BlindBoxProductMapping[],
    productCache: Map<string, Awaited<ReturnType<ShoplineCatalogService['getProduct']>> | null>,
  ): Promise<BlindBoxOrderDetectionResult> {
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

    const product = productCache.get(lineItem.product_id) || null;
    if (product && isBlindBoxProduct(product)) {
      const blindBox = await this.dependencies.blindBoxDiscoveryService.ensureBlindBoxForDetectedProduct(shop, product, {
        productVariantId: lineItem.variant_id || null,
      });
      const syntheticMapping = toSyntheticBlindBoxReferenceMapping(blindBox);

      if (syntheticMapping) {
        return {
          lineItem,
          reason: 'BLIND_BOX_MATCH',
          mapping: syntheticMapping,
        };
      }
    }

    return detectBlindBoxOrderLines(
      {
        id: lineItem.id,
        line_items: [lineItem],
      },
      detectionMappings,
    )[0];
  }

  private async loadOrderDetectionMappings(shop: string): Promise<BlindBoxProductMapping[]> {
    const blindBoxes = await this.dependencies.blindBoxRepository.listByShop(shop);
    const directReferenceMappings = blindBoxes
      .map(toSyntheticBlindBoxReferenceMapping)
      .filter((mapping): mapping is BlindBoxProductMapping => Boolean(mapping));
    const blindBoxIdsWithDirectReference = new Set(directReferenceMappings.map((mapping) => mapping.blindBoxId));
    const legacyMappings = (await this.dependencies.blindBoxProductMappingRepository.listByShop(shop)).filter(
      (mapping) => !blindBoxIdsWithDirectReference.has(mapping.blindBoxId),
    );

    return [...directReferenceMappings, ...legacyMappings];
  }

  private async processMatchedBlindBoxLine(
    shop: string,
    orderId: string,
    mapping: BlindBoxProductMapping,
    lineItem: OrderPaidLineItem,
  ): Promise<AssignedBlindBoxOrderLine | AssignmentProcessingFailure> {
    const assignmentIdempotencyKey = createIdempotencyKey(shop, orderId, lineItem.id);
    let existingAssignment = await this.dependencies.blindBoxAssignmentRepository.findByOrderLine(
      shop,
      orderId,
      lineItem.id,
    );

    const blindBox = existingAssignment
      ? await this.dependencies.blindBoxRepository.findById(shop, existingAssignment.blindBoxId)
      : await this.dependencies.blindBoxRepository.findById(shop, mapping.blindBoxId);

    if (!blindBox || blindBox.status !== 'active') {
      return toAssignmentFailure(
        mapping.blindBoxId,
        lineItem.id,
        orderId,
        'BLIND_BOX_NOT_ACTIVE',
        'Mapped blind-box product reference is missing or not active',
      );
    }

    if ((lineItem.quantity || 1) > 1) {
      return toAssignmentFailure(
        blindBox.id,
        lineItem.id,
        orderId,
        'UNSUPPORTED_QUANTITY',
        'Blind-box purchases only support quantity 1 per order line. Reduce quantity before checkout and retry the order.',
      );
    }

    const usesCollectionLinkedRewards =
      Boolean(existingAssignment?.selectedRewardProductId) || Boolean(blindBox.shoplineProductId);

    if (!usesCollectionLinkedRewards) {
      return toAssignmentFailure(
        blindBox.id,
        lineItem.id,
        orderId,
        'REWARD_COLLECTION_NOT_CONFIGURED',
        'Blind-box product is missing a SHOPLINE product ID. ' +
        'Ensure the product is tagged with "blind-box" and "blind-box-collection:<handle>" in SHOPLINE.',
      );
    }

    return this.processCollectionLinkedLine(
      shop,
      orderId,
      blindBox,
      lineItem,
      existingAssignment,
      assignmentIdempotencyKey,
    );
  }

  private async processCollectionLinkedLine(
    shop: string,
    orderId: string,
    blindBox: BlindBox,
    lineItem: OrderPaidLineItem,
    existingAssignment:
      | Awaited<ReturnType<BlindBoxAssignmentRepository['findByOrderLine']>>
      | null,
    assignmentIdempotencyKey: string,
  ): Promise<AssignedBlindBoxOrderLine | AssignmentProcessingFailure> {
    if (existingAssignment?.selectedRewardProductId) {
      const persistedBoundary =
        await this.dependencies.assignmentInventoryBoundaryService.persistAssignmentInventoryBoundary(
          shop,
          {
            blindBoxId: existingAssignment.blindBoxId,
            orderId,
            orderLineId: lineItem.id,
            rewardGroupId: existingAssignment.rewardGroupId,
            selectedRewardProductId: existingAssignment.selectedRewardProductId,
            selectedRewardVariantId: existingAssignment.selectedRewardVariantId,
            selectedRewardTitleSnapshot: existingAssignment.selectedRewardTitleSnapshot,
            selectedRewardVariantTitleSnapshot: existingAssignment.selectedRewardVariantTitleSnapshot,
            selectedRewardPayloadJson: existingAssignment.selectedRewardPayloadJson,
            selectionStrategy:
              (existingAssignment.selectionStrategy || blindBox.selectionStrategy) as NonNullable<
                BlindBox['selectionStrategy']
              >,
            idempotencyKey: assignmentIdempotencyKey,
            assignmentMetadata: existingAssignment.metadata,
          },
        );

      return this.handlePersistedBoundary(
        shop,
        blindBox,
        lineItem,
        orderId,
        persistedBoundary.assignment,
        persistedBoundary.inventoryOperation,
        persistedBoundary.wasExistingAssignment,
      );
    }

    let preview;
    try {
      preview = await this.dependencies.rewardCandidateService.previewCandidatesForBlindBox(shop, blindBox.id);
    } catch (error) {
      if (error instanceof RewardCandidateResolutionError) {
        if (
          error.code === 'BLIND_BOX_COLLECTION_NOT_CONFIGURED' ||
          error.code === 'BLIND_BOX_COLLECTION_TAG_INVALID' ||
          error.code === 'BLIND_BOX_REWARD_GROUP_MISSING'
        ) {
          return toAssignmentFailure(
            blindBox.id,
            lineItem.id,
            orderId,
            'REWARD_COLLECTION_NOT_CONFIGURED',
            error.message,
          );
        }

        if (error.code === 'BLIND_BOX_COLLECTION_NOT_FOUND') {
          return toAssignmentFailure(
            blindBox.id,
            lineItem.id,
            orderId,
            'REWARD_COLLECTION_NOT_FOUND',
            error.message,
          );
        }
      }

      if (error instanceof Error && error.message.toLowerCase().includes('reward group')) {
        return toAssignmentFailure(
          blindBox.id,
          lineItem.id,
          orderId,
          'REWARD_GROUP_NOT_LINKED',
          error.message,
        );
      }

      throw error;
    }

    if (preview.rawCollectionSize === 0) {
      return toAssignmentFailure(
        blindBox.id,
        lineItem.id,
        orderId,
        'EMPTY_REWARD_GROUP',
        'The linked SHOPLINE reward collection does not contain any products',
      );
    }

    if (!preview.eligibleCandidates.length) {
      return toAssignmentFailure(
        blindBox.id,
        lineItem.id,
        orderId,
        'NO_ELIGIBLE_REWARDS',
        preview.excludedCandidates[0]?.message ||
          'The linked SHOPLINE reward collection does not currently expose any eligible candidates',
      );
    }

    let selectedReward: RewardCandidate;
    try {
      selectedReward = selectRewardCandidate(blindBox, preview.eligibleCandidates, this.dependencies.random);
    } catch (error) {
      if (error instanceof ValidationError) {
        return toAssignmentFailure(blindBox.id, lineItem.id, orderId, 'INVALID_WEIGHTING', error.message);
      }

      throw error;
    }

    const assignmentMetadata = JSON.stringify({
      orderLine: summarizeLineItem(lineItem),
      rewardGroup: {
        id: preview.rewardGroup?.id || null,
        collectionId: preview.collection.id,
        collectionHandle: preview.collection.handle,
        resolutionSource: preview.resolutionSource,
        rawCollectionSize: preview.rawCollectionSize,
        excludedCandidateCount: preview.excludedCandidates.length,
      },
      selection: {
        eligibleCandidateCount: preview.eligibleCandidates.length,
        selectedRewardProductId: selectedReward.productId,
        selectedRewardVariantId: selectedReward.variantId,
        strategy: blindBox.selectionStrategy,
      },
    });

    const persistedBoundary =
      await this.dependencies.assignmentInventoryBoundaryService.persistAssignmentInventoryBoundary(
        shop,
        {
          blindBoxId: blindBox.id,
          orderId,
          orderLineId: lineItem.id,
          rewardGroupId: preview.rewardGroup?.id || null,
          selectedRewardProductId: selectedReward.productId,
          selectedRewardVariantId: selectedReward.variantId,
          selectedRewardTitleSnapshot: selectedReward.productTitle,
          selectedRewardVariantTitleSnapshot: selectedReward.variantTitle,
          selectedRewardPayloadJson: selectedReward.payloadJson,
          selectionStrategy: blindBox.selectionStrategy,
          idempotencyKey: assignmentIdempotencyKey,
          assignmentMetadata,
        },
      );

    return this.handlePersistedBoundary(
      shop,
      blindBox,
      lineItem,
      orderId,
      persistedBoundary.assignment,
      persistedBoundary.inventoryOperation,
      persistedBoundary.wasExistingAssignment,
    );
  }

  private async processLegacyManualPoolLine(
    shop: string,
    orderId: string,
    blindBox: BlindBox,
    lineItem: OrderPaidLineItem,
    existingAssignment:
      | Awaited<ReturnType<BlindBoxAssignmentRepository['findByOrderLine']>>
      | null,
    assignmentIdempotencyKey: string,
  ): Promise<AssignedBlindBoxOrderLine | AssignmentProcessingFailure> {
    this.dependencies.logger.warn('Using deprecated legacy manual pool blind-box path', {
      shop,
      blindBoxId: blindBox.id,
      orderId,
      orderLineId: lineItem.id,
    });

    let selectedPoolItemId = existingAssignment?.selectedPoolItemId || null;
    const wasExistingAssignment = Boolean(existingAssignment?.selectedPoolItemId);

    if (!selectedPoolItemId) {
      const poolItems = await this.dependencies.blindBoxPoolItemRepository.listByBlindBoxId(shop, blindBox.id);
      if (!poolItems.length) {
        return toAssignmentFailure(
          blindBox.id,
          lineItem.id,
          orderId,
          'EMPTY_POOL',
          'Blind box has no configured legacy pool items',
        );
      }

      const { eligibleItems } = evaluateEligiblePoolItems(poolItems);
      if (!eligibleItems.length) {
        return toAssignmentFailure(
          blindBox.id,
          lineItem.id,
          orderId,
          'NO_ELIGIBLE_ITEMS',
          'Blind box has no enabled in-stock legacy pool items',
        );
      }

      let selectedPoolItem: BlindBoxPoolItem;
      try {
        selectedPoolItem = selectPoolItemForBlindBox(blindBox, poolItems, {
          random: this.dependencies.random,
        });
      } catch (error) {
        if (error instanceof ValidationError) {
          return toAssignmentFailure(
            blindBox.id,
            lineItem.id,
            orderId,
            'INVALID_WEIGHTING',
            error.message,
          );
        }

        throw error;
      }

      const assignmentMetadata = JSON.stringify({
        orderLine: summarizeLineItem(lineItem),
        selection: {
          eligibleItemCount: eligibleItems.length,
          selectedPoolItemId: selectedPoolItem.id,
          strategy: blindBox.selectionStrategy,
          mode: 'legacy_manual_pool',
        },
      });

      const persistedBoundary =
        await this.dependencies.assignmentInventoryBoundaryService.persistAssignmentInventoryBoundary(
          shop,
          {
            blindBoxId: blindBox.id,
            orderId,
            orderLineId: lineItem.id,
            selectedPoolItemId: selectedPoolItem.id,
            selectionStrategy: blindBox.selectionStrategy,
            idempotencyKey: assignmentIdempotencyKey,
            assignmentMetadata,
          },
        );

      return this.handlePersistedBoundary(
        shop,
        blindBox,
        lineItem,
        orderId,
        persistedBoundary.assignment,
        persistedBoundary.inventoryOperation,
        persistedBoundary.wasExistingAssignment,
      );
    }

    if (!existingAssignment || !selectedPoolItemId) {
      return toAssignmentFailure(
        blindBox.id,
        lineItem.id,
        orderId,
        'INVENTORY_WORKFLOW_FAILURE',
        'Legacy blind-box assignment could not be finalized for inventory execution',
      );
    }

    const persistedBoundary =
      await this.dependencies.assignmentInventoryBoundaryService.persistAssignmentInventoryBoundary(
        shop,
        {
          blindBoxId: existingAssignment.blindBoxId,
          orderId,
          orderLineId: lineItem.id,
          selectedPoolItemId,
          selectionStrategy:
            (existingAssignment.selectionStrategy || blindBox.selectionStrategy) as NonNullable<
              BlindBox['selectionStrategy']
            >,
          idempotencyKey: assignmentIdempotencyKey,
          assignmentMetadata: existingAssignment.metadata,
        },
      );

    return this.handlePersistedBoundary(
      shop,
      blindBox,
      lineItem,
      orderId,
      persistedBoundary.assignment,
      persistedBoundary.inventoryOperation,
      persistedBoundary.wasExistingAssignment || wasExistingAssignment,
    );
  }

  private async handlePersistedBoundary(
    shop: string,
    blindBox: BlindBox,
    lineItem: OrderPaidLineItem,
    orderId: string,
    assignment: {
      id: string;
      blindBoxId: string;
      selectedPoolItemId: string | null;
      selectedRewardProductId: string | null;
      selectedRewardVariantId: string | null;
      selectedRewardTitleSnapshot: string | null;
      selectionStrategy: BlindBox['selectionStrategy'] | null;
    },
    inventoryOperation: InventoryOperation,
    wasExistingAssignment: boolean,
  ): Promise<AssignedBlindBoxOrderLine | AssignmentProcessingFailure> {
    if (!assignment.selectedPoolItemId && !assignment.selectedRewardProductId) {
      return toAssignmentFailure(
        blindBox.id,
        lineItem.id,
        orderId,
        'INVENTORY_WORKFLOW_FAILURE',
        'Inventory operation is missing both legacy pool-item and selected reward-product context',
      );
    }

    if (inventoryOperation.status === 'succeeded') {
      return toAssignedBlindBoxOrderLine({
        blindBoxId: assignment.blindBoxId,
        lineItemId: lineItem.id,
        orderId,
        assignmentId: assignment.id,
        selectedPoolItemId: assignment.selectedPoolItemId,
        selectedRewardProductId: assignment.selectedRewardProductId || inventoryOperation.rewardProductId,
        selectedRewardVariantId: assignment.selectedRewardVariantId || inventoryOperation.rewardVariantId,
        selectedRewardTitleSnapshot:
          assignment.selectedRewardTitleSnapshot || inventoryOperation.rewardTitleSnapshot,
        selectionStrategy: assignment.selectionStrategy || blindBox.selectionStrategy,
        inventoryOperationId: inventoryOperation.id,
        inventoryStatus: inventoryOperation.status,
        wasExistingAssignment,
      });
    }

    if (inventoryOperation.status === 'processing') {
      return toAssignmentFailure(
        blindBox.id,
        lineItem.id,
        orderId,
        'INVENTORY_REQUIRES_RECONCILIATION',
        inventoryOperation.reason ||
          'Inventory execution is already processing and requires reconciliation before retry',
      );
    }

    if (wasExistingAssignment && inventoryOperation.status === 'failed') {
      return toAssignmentFailure(
        blindBox.id,
        lineItem.id,
        orderId,
        'INVENTORY_WORKFLOW_FAILURE',
        inventoryOperation.reason || 'Existing inventory workflow is still failed for this assignment',
      );
    }

    if (this.dependencies.inventoryExecutionMode !== 'execute') {
      this.dependencies.logger.info('Deferred inventory workflow for blind-box assignment', {
        shop,
        blindBoxId: blindBox.id,
        orderId,
        orderLineId: lineItem.id,
        assignmentId: assignment.id,
        inventoryOperationId: inventoryOperation.id,
      });

      return toAssignedBlindBoxOrderLine({
        blindBoxId: assignment.blindBoxId,
        lineItemId: lineItem.id,
        orderId,
        assignmentId: assignment.id,
        selectedPoolItemId: assignment.selectedPoolItemId,
        selectedRewardProductId: assignment.selectedRewardProductId || inventoryOperation.rewardProductId,
        selectedRewardVariantId: assignment.selectedRewardVariantId || inventoryOperation.rewardVariantId,
        selectedRewardTitleSnapshot:
          assignment.selectedRewardTitleSnapshot || inventoryOperation.rewardTitleSnapshot,
        selectionStrategy: assignment.selectionStrategy || blindBox.selectionStrategy,
        inventoryOperationId: inventoryOperation.id,
        inventoryStatus: inventoryOperation.status,
        wasExistingAssignment,
      });
    }

    const executionResult = await this.dependencies.inventoryExecutionService.executeInventoryOperation(
      shop,
      inventoryOperation.id,
      {
        trigger: 'webhook',
      },
    );

    return this.mapExecutionResultToOutcome(
      blindBox,
      lineItem,
      orderId,
      executionResult,
      wasExistingAssignment,
    );
  }

  private mapExecutionResultToOutcome(
    blindBox: BlindBox,
    lineItem: OrderPaidLineItem,
    orderId: string,
    executionResult: InventoryExecutionResult,
    wasExistingAssignment: boolean,
  ): AssignedBlindBoxOrderLine | AssignmentProcessingFailure {
    if (executionResult.outcome === 'succeeded' || executionResult.outcome === 'noop') {
      return toAssignedBlindBoxOrderLine({
        blindBoxId: executionResult.assignment.blindBoxId,
        lineItemId: lineItem.id,
        orderId,
        assignmentId: executionResult.assignment.id,
        selectedPoolItemId: executionResult.assignment.selectedPoolItemId,
        selectedRewardProductId:
          executionResult.assignment.selectedRewardProductId || executionResult.operation.rewardProductId,
        selectedRewardVariantId:
          executionResult.assignment.selectedRewardVariantId || executionResult.operation.rewardVariantId,
        selectedRewardTitleSnapshot:
          executionResult.assignment.selectedRewardTitleSnapshot ||
          executionResult.operation.rewardTitleSnapshot ||
          executionResult.rewardTarget.titleSnapshot,
        selectionStrategy: executionResult.assignment.selectionStrategy || blindBox.selectionStrategy,
        inventoryOperationId: executionResult.operation.id,
        inventoryStatus: executionResult.operation.status,
        wasExistingAssignment,
      });
    }

    if (executionResult.outcome === 'processing') {
      return toAssignmentFailure(
        blindBox.id,
        lineItem.id,
        orderId,
        'INVENTORY_REQUIRES_RECONCILIATION',
        executionResult.message || 'Inventory execution requires reconciliation before retry',
      );
    }

    return toAssignmentFailure(
      blindBox.id,
      lineItem.id,
      orderId,
      'INVENTORY_WORKFLOW_FAILURE',
      executionResult.message || 'Inventory execution failed',
    );
  }
}

export async function getPaidOrderAssignmentService(): Promise<PaidOrderAssignmentService> {
  const blindBoxRepository = await getBlindBoxRepository();
  const blindBoxPoolItemRepository = await getBlindBoxPoolItemRepository();
  const blindBoxProductMappingRepository = await getBlindBoxProductMappingRepository();
  const blindBoxAssignmentRepository = await getBlindBoxAssignmentRepository();
  const blindBoxDiscoveryService = await getBlindBoxDiscoveryService();
  const catalogService = await getShoplineCatalogService();
  const rewardCandidateService = await getRewardCandidateService();
  const assignmentInventoryBoundaryService = await getAssignmentInventoryBoundaryService();
  const inventoryExecutionService = await getInventoryExecutionService();
  const runtimeConfig = getRuntimeConfig();

  return new PaidOrderAssignmentService({
    blindBoxRepository,
    blindBoxPoolItemRepository,
    blindBoxProductMappingRepository,
    blindBoxAssignmentRepository,
    blindBoxDiscoveryService,
    catalogService,
    rewardCandidateService,
    assignmentInventoryBoundaryService,
    inventoryExecutionService,
    logger,
    random: Math.random,
    inventoryExecutionMode: runtimeConfig.blindBoxInventoryExecutionMode,
  });
}
