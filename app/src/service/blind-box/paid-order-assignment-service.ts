import { BlindBox, BlindBoxPoolItem, BlindBoxProductMapping, InventoryOperation } from '../../domain/blind-box/types';
import { OrderPaidLineItem, OrderPaidWebhookPayload } from '../../domain/blind-box/order-paid';
import {
  BlindBoxOrderDetectionResult,
  detectBlindBoxOrderLines,
} from '../../domain/blind-box/order-detection';
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

export type AssignmentFailureReason =
  | 'BLIND_BOX_NOT_ACTIVE'
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
  selectedPoolItemId: string;
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
    selectedPoolItemId: string;
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
    selectionStrategy: executionResult.selectionStrategy,
    inventoryOperationId: executionResult.inventoryOperationId,
    inventoryStatus: executionResult.inventoryStatus,
    wasExistingAssignment: executionResult.wasExistingAssignment,
  };
}

export class PaidOrderAssignmentService {
  constructor(private readonly dependencies: PaidOrderAssignmentServiceDependencies) {}

  async processPaidOrder(shop: string, payload: OrderPaidWebhookPayload): Promise<PaidOrderProcessingSummary> {
    const productMappings = await this.dependencies.blindBoxProductMappingRepository.listByShop(shop);
    const detections = detectBlindBoxOrderLines(payload, productMappings);
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

    let blindBox = existingAssignment
      ? await this.dependencies.blindBoxRepository.findById(shop, existingAssignment.blindBoxId)
      : await this.dependencies.blindBoxRepository.findById(shop, mapping.blindBoxId);

    if (!blindBox || blindBox.status !== 'active') {
      return toAssignmentFailure(
        mapping.blindBoxId,
        lineItem.id,
        orderId,
        'BLIND_BOX_NOT_ACTIVE',
        'Mapped blind box is missing or not active',
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
          'Blind box has no configured pool items',
        );
      }

      const { eligibleItems } = evaluateEligiblePoolItems(poolItems);
      if (!eligibleItems.length) {
        return toAssignmentFailure(
          blindBox.id,
          lineItem.id,
          orderId,
          'NO_ELIGIBLE_ITEMS',
          'Blind box has no enabled in-stock pool items',
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

      existingAssignment = persistedBoundary.assignment;
      selectedPoolItemId = persistedBoundary.assignment.selectedPoolItemId;

      if (!selectedPoolItemId) {
        return toAssignmentFailure(
          blindBox.id,
          lineItem.id,
          orderId,
          'INVENTORY_WORKFLOW_FAILURE',
          'Blind-box assignment did not persist a selected pool item before inventory execution',
        );
      }

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
        'Blind-box assignment could not be finalized for inventory execution',
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
      selectionStrategy: BlindBox['selectionStrategy'] | null;
    },
    inventoryOperation: InventoryOperation,
    wasExistingAssignment: boolean,
  ): Promise<AssignedBlindBoxOrderLine | AssignmentProcessingFailure> {
    const selectedPoolItemId = assignment.selectedPoolItemId || inventoryOperation.poolItemId;
    if (!selectedPoolItemId) {
      return toAssignmentFailure(
        blindBox.id,
        lineItem.id,
        orderId,
        'INVENTORY_WORKFLOW_FAILURE',
        'Inventory operation is missing the selected pool item for this assignment',
      );
    }

    if (inventoryOperation.status === 'succeeded') {
      return toAssignedBlindBoxOrderLine({
        blindBoxId: assignment.blindBoxId,
        lineItemId: lineItem.id,
        orderId,
        assignmentId: assignment.id,
        selectedPoolItemId,
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
        selectedPoolItemId,
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
        selectedPoolItemId: executionResult.assignment.selectedPoolItemId || executionResult.poolItem.id,
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
  const assignmentInventoryBoundaryService = await getAssignmentInventoryBoundaryService();
  const inventoryExecutionService = await getInventoryExecutionService();
  const runtimeConfig = getRuntimeConfig();

  return new PaidOrderAssignmentService({
    blindBoxRepository,
    blindBoxPoolItemRepository,
    blindBoxProductMappingRepository,
    blindBoxAssignmentRepository,
    assignmentInventoryBoundaryService,
    inventoryExecutionService,
    logger,
    random: Math.random,
    inventoryExecutionMode: runtimeConfig.blindBoxInventoryExecutionMode,
  });
}
