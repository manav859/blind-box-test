import {
  BlindBox,
  BlindBoxProductMapping,
  InventoryOperation,
  RewardCandidate,
} from '../../domain/blind-box/types';
import { BlindBoxSelectionStrategy } from '../../domain/blind-box/status';
import { OrderPaidLineItem, OrderPaidWebhookPayload } from '../../domain/blind-box/order-paid';
import {
  BlindBoxOrderDetectionResult,
  detectBlindBoxOrderLines,
} from '../../domain/blind-box/order-detection';
import { ValidationError } from '../../lib/errors';
import { logger, Logger } from '../../lib/logger';
import { BlindBoxRepository, getBlindBoxRepository } from '../../repository/blind-box-repository';
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
import { getRewardCandidateService, RewardCandidateService } from './reward-candidate-service';
import { getOrderLineItems, getOrderContext, OrderContext } from '../../domain/blind-box/order-paid';

// Selection is always inventory-weighted in the explicit-product-selection model.
const SELECTION_STRATEGY: BlindBoxSelectionStrategy = 'weighted';

export type AssignmentFailureReason =
  | 'BLIND_BOX_NOT_ACTIVE'
  | 'EMPTY_POOL'
  | 'REWARD_POOL_OUT_OF_STOCK'
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
  selectionStrategy: BlindBoxSelectionStrategy | null;
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
  blindBoxProductMappingRepository: BlindBoxProductMappingRepository;
  blindBoxAssignmentRepository: BlindBoxAssignmentRepository;
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
  return { blindBoxId, lineItemId, orderId, reason, message };
}

function toAssignedBlindBoxOrderLine(executionResult: {
  assignmentId: string;
  blindBoxId: string;
  selectedPoolItemId: string | null;
  selectedRewardProductId: string | null;
  selectedRewardVariantId: string | null;
  selectedRewardTitleSnapshot: string | null;
  selectionStrategy: BlindBoxSelectionStrategy | null;
  inventoryOperationId: string;
  inventoryStatus: InventoryOperation['status'];
  lineItemId: string;
  orderId: string;
  wasExistingAssignment: boolean;
}): AssignedBlindBoxOrderLine {
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

/**
 * Synthetic mapping: order line product_id → blind box, keyed on the box's
 * trigger product. This is how a paid order finds its blind box (DB lookup, no tags).
 */
function toTriggerProductMapping(blindBox: BlindBox): BlindBoxProductMapping | null {
  if (!blindBox.triggerProductId) {
    return null;
  }

  return {
    id: `blind-box-trigger:${blindBox.id}`,
    shop: blindBox.shop,
    blindBoxId: blindBox.id,
    productId: blindBox.triggerProductId,
    productVariantId: null,
    enabled: true,
    createdAt: blindBox.createdAt,
    updatedAt: blindBox.updatedAt,
  };
}

/**
 * Inventory-weighted random selection: P(item) = item.selectionWeight / Σ weight,
 * where selectionWeight is the candidate's live inventory. Callers pass only
 * in-stock candidates, so every weight is ≥ 1.
 */
function selectRewardCandidate(candidates: RewardCandidate[], random: () => number): RewardCandidate {
  if (!candidates.length) {
    throw new ValidationError('No eligible reward candidates are available for this blind box');
  }

  const totalWeight = candidates.reduce((sum, candidate) => {
    if (!Number.isFinite(candidate.selectionWeight) || candidate.selectionWeight <= 0) {
      throw new ValidationError('Inventory-weighted selection requires every candidate to have positive stock');
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

export class PaidOrderAssignmentService {
  constructor(private readonly dependencies: PaidOrderAssignmentServiceDependencies) {}

  async processPaidOrder(shop: string, payload: OrderPaidWebhookPayload): Promise<PaidOrderProcessingSummary> {
    const lineItems = getOrderLineItems(payload);
    this.dependencies.logger.info('paid-order: processing started', {
      shop,
      orderId: payload.id,
      lineItemCount: lineItems.length,
      lineItems: lineItems.map((li) => ({
        lineItemId: li.id,
        productId: li.product_id,
        title: li.title ?? null,
        quantity: li.quantity ?? 1,
      })),
    });

    const orderContext = getOrderContext(payload);
    const detectionMappings = await this.loadOrderDetectionMappings(shop);
    const detections: BlindBoxOrderDetectionResult[] = [];

    for (const lineItem of lineItems) {
      detections.push(...detectBlindBoxOrderLines({ id: lineItem.id, line_items: [lineItem] }, detectionMappings));
    }

    const matchedDetections = detections.filter((result) => result.reason === 'BLIND_BOX_MATCH');
    const ignoredDetections = detections.filter((result) => result.reason !== 'BLIND_BOX_MATCH');

    const assignments: AssignedBlindBoxOrderLine[] = [];
    const failures: AssignmentProcessingFailure[] = [];

    for (const detection of matchedDetections) {
      const mapping = detection.mapping as BlindBoxProductMapping;
      const outcome = await this.processMatchedBlindBoxLine(shop, payload.id, mapping, detection.lineItem, orderContext);
      if ('reason' in outcome) {
        failures.push(outcome);
      } else {
        assignments.push(outcome);
      }
    }

    this.dependencies.logger.info('paid-order: processing complete', {
      shop,
      orderId: payload.id,
      detectedLineCount: detections.length,
      matchedLineCount: matchedDetections.length,
      assignmentCount: assignments.length,
      failureCount: failures.length,
      failures: failures.map((f) => ({ lineItemId: f.lineItemId, reason: f.reason, message: f.message })),
    });

    return {
      detectedLineCount: detections.length,
      matchedLineCount: matchedDetections.length,
      ignoredDetections,
      assignments,
      failures,
    };
  }

  private async loadOrderDetectionMappings(shop: string): Promise<BlindBoxProductMapping[]> {
    const blindBoxes = await this.dependencies.blindBoxRepository.listByShop(shop);

    // Only ACTIVE boxes participate. Match by trigger product (DB lookup, no tags).
    const activeBlindBoxes = blindBoxes.filter((blindBox) => blindBox.status === 'active');
    const activeBlindBoxIds = new Set(activeBlindBoxes.map((blindBox) => blindBox.id));
    const skippedCount = blindBoxes.length - activeBlindBoxes.length;
    if (skippedCount > 0) {
      this.dependencies.logger.info('paid-order: skipped non-active blind boxes for detection', {
        shop,
        totalBlindBoxes: blindBoxes.length,
        activeBlindBoxes: activeBlindBoxes.length,
        skippedCount,
      });
    }

    const triggerMappings = activeBlindBoxes
      .map(toTriggerProductMapping)
      .filter((mapping): mapping is BlindBoxProductMapping => Boolean(mapping));
    const blindBoxIdsWithTrigger = new Set(triggerMappings.map((mapping) => mapping.blindBoxId));

    // Legacy explicit product mappings (still supported) for active boxes only.
    const legacyMappings = (await this.dependencies.blindBoxProductMappingRepository.listByShop(shop)).filter(
      (mapping) =>
        !blindBoxIdsWithTrigger.has(mapping.blindBoxId) && activeBlindBoxIds.has(mapping.blindBoxId),
    );

    return [...triggerMappings, ...legacyMappings];
  }

  private async processMatchedBlindBoxLine(
    shop: string,
    orderId: string,
    mapping: BlindBoxProductMapping,
    lineItem: OrderPaidLineItem,
    orderContext: OrderContext,
  ): Promise<AssignedBlindBoxOrderLine | AssignmentProcessingFailure> {
    const assignmentIdempotencyKey = createIdempotencyKey(shop, orderId, lineItem.id);
    const existingAssignment = await this.dependencies.blindBoxAssignmentRepository.findByOrderLine(
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
        'Matched blind box is missing or not active',
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

    return this.processPoolLine(
      shop,
      orderId,
      blindBox,
      lineItem,
      existingAssignment,
      assignmentIdempotencyKey,
      orderContext,
    );
  }

  private async processPoolLine(
    shop: string,
    orderId: string,
    blindBox: BlindBox,
    lineItem: OrderPaidLineItem,
    existingAssignment: Awaited<ReturnType<BlindBoxAssignmentRepository['findByOrderLine']>> | null,
    assignmentIdempotencyKey: string,
    orderContext: OrderContext,
  ): Promise<AssignedBlindBoxOrderLine | AssignmentProcessingFailure> {
    // Replay: a reward was already chosen for this order line — re-persist the
    // same selection (idempotent), never re-roll.
    if (existingAssignment?.selectedRewardProductId) {
      const persistedBoundary =
        await this.dependencies.assignmentInventoryBoundaryService.persistAssignmentInventoryBoundary(shop, {
          blindBoxId: existingAssignment.blindBoxId,
          orderId,
          orderLineId: lineItem.id,
          rewardGroupId: existingAssignment.rewardGroupId,
          selectedRewardProductId: existingAssignment.selectedRewardProductId,
          selectedRewardVariantId: existingAssignment.selectedRewardVariantId,
          selectedRewardTitleSnapshot: existingAssignment.selectedRewardTitleSnapshot,
          selectedRewardVariantTitleSnapshot: existingAssignment.selectedRewardVariantTitleSnapshot,
          selectedRewardPayloadJson: existingAssignment.selectedRewardPayloadJson,
          selectionStrategy: existingAssignment.selectionStrategy || SELECTION_STRATEGY,
          idempotencyKey: assignmentIdempotencyKey,
          assignmentMetadata: existingAssignment.metadata,
        });

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

    const preview = await this.dependencies.rewardCandidateService.previewCandidatesForBlindBox(shop, blindBox.id);

    if (preview.poolSize === 0) {
      return toAssignmentFailure(
        blindBox.id,
        lineItem.id,
        orderId,
        'EMPTY_POOL',
        'This blind box has no reward products in its pool',
      );
    }

    if (!preview.eligibleCandidates.length) {
      return toAssignmentFailure(
        blindBox.id,
        lineItem.id,
        orderId,
        'REWARD_POOL_OUT_OF_STOCK',
        preview.excludedCandidates[0]?.message ||
          'Every reward product in this blind box is currently out of stock',
      );
    }

    let selectedReward: RewardCandidate;
    try {
      selectedReward = selectRewardCandidate(preview.eligibleCandidates, this.dependencies.random);
    } catch (error) {
      if (error instanceof ValidationError) {
        return toAssignmentFailure(blindBox.id, lineItem.id, orderId, 'INVALID_WEIGHTING', error.message);
      }
      throw error;
    }

    const totalWeight = preview.eligibleCandidates.reduce((sum, candidate) => sum + candidate.selectionWeight, 0);
    const assignmentMetadata = JSON.stringify({
      order: {
        name: orderContext.orderName,
        customerName: orderContext.customerName,
        customerEmail: orderContext.customerEmail,
      },
      orderLine: summarizeLineItem(lineItem),
      pool: {
        poolSize: preview.poolSize,
        eligibleCandidateCount: preview.eligibleCandidates.length,
        excludedCandidateCount: preview.excludedCandidates.length,
      },
      selection: {
        strategy: 'inventory_weighted',
        selectedRewardProductId: selectedReward.productId,
        selectedRewardVariantId: selectedReward.variantId,
        selectedRewardStock: selectedReward.selectionWeight,
        totalPoolStock: totalWeight,
        selectionProbability: totalWeight > 0 ? selectedReward.selectionWeight / totalWeight : null,
      },
    });

    const persistedBoundary =
      await this.dependencies.assignmentInventoryBoundaryService.persistAssignmentInventoryBoundary(shop, {
        blindBoxId: blindBox.id,
        orderId,
        orderLineId: lineItem.id,
        rewardGroupId: null,
        selectedRewardProductId: selectedReward.productId,
        selectedRewardVariantId: selectedReward.variantId,
        selectedRewardTitleSnapshot: selectedReward.productTitle,
        selectedRewardVariantTitleSnapshot: selectedReward.variantTitle,
        selectedRewardPayloadJson: selectedReward.payloadJson,
        selectionStrategy: SELECTION_STRATEGY,
        idempotencyKey: assignmentIdempotencyKey,
        assignmentMetadata,
      });

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
      selectionStrategy: BlindBoxSelectionStrategy | null;
    },
    inventoryOperation: InventoryOperation,
    wasExistingAssignment: boolean,
  ): Promise<AssignedBlindBoxOrderLine | AssignmentProcessingFailure> {
    if (!assignment.selectedRewardProductId) {
      return toAssignmentFailure(
        blindBox.id,
        lineItem.id,
        orderId,
        'INVENTORY_WORKFLOW_FAILURE',
        'Inventory operation is missing the selected reward-product context',
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
        selectionStrategy: assignment.selectionStrategy || SELECTION_STRATEGY,
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
        selectionStrategy: assignment.selectionStrategy || SELECTION_STRATEGY,
        inventoryOperationId: inventoryOperation.id,
        inventoryStatus: inventoryOperation.status,
        wasExistingAssignment,
      });
    }

    const executionResult = await this.dependencies.inventoryExecutionService.executeInventoryOperation(
      shop,
      inventoryOperation.id,
      { trigger: 'webhook' },
    );

    return this.mapExecutionResultToOutcome(blindBox, lineItem, orderId, executionResult, wasExistingAssignment);
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
        selectionStrategy: executionResult.assignment.selectionStrategy || SELECTION_STRATEGY,
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
  const blindBoxProductMappingRepository = await getBlindBoxProductMappingRepository();
  const blindBoxAssignmentRepository = await getBlindBoxAssignmentRepository();
  const rewardCandidateService = await getRewardCandidateService();
  const assignmentInventoryBoundaryService = await getAssignmentInventoryBoundaryService();
  const inventoryExecutionService = await getInventoryExecutionService();
  const runtimeConfig = getRuntimeConfig();

  return new PaidOrderAssignmentService({
    blindBoxRepository,
    blindBoxProductMappingRepository,
    blindBoxAssignmentRepository,
    rewardCandidateService,
    assignmentInventoryBoundaryService,
    inventoryExecutionService,
    logger,
    random: Math.random,
    inventoryExecutionMode: runtimeConfig.blindBoxInventoryExecutionMode,
  });
}
