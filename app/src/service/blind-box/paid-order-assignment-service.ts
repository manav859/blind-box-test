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
import { InventoryOperationService, getInventoryOperationService } from '../inventory/inventory-operation-service';
import { BlindBoxAssignmentService } from './assignment-service';
import { UnimplementedInventoryGateway, InventoryGateway } from '../../integration/shopline/inventory-gateway';
import { getRuntimeConfig } from '../../lib/config';

export type AssignmentFailureReason =
  | 'BLIND_BOX_NOT_ACTIVE'
  | 'EMPTY_POOL'
  | 'NO_ELIGIBLE_ITEMS'
  | 'INVALID_WEIGHTING'
  | 'INVENTORY_WORKFLOW_FAILURE';

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
  blindBoxAssignmentService: BlindBoxAssignmentService;
  inventoryOperationService: InventoryOperationService;
  inventoryGateway: InventoryGateway;
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
    const existingAssignment = await this.dependencies.blindBoxAssignmentRepository.findByOrderLine(
      shop,
      orderId,
      lineItem.id,
    );

    if (existingAssignment?.selectedPoolItemId) {
      const existingInventoryOperations = await this.dependencies.inventoryOperationService.listInventoryOperationsForAssignment(
        shop,
        existingAssignment.id,
      );

      return {
        blindBoxId: existingAssignment.blindBoxId,
        lineItemId: lineItem.id,
        orderId,
        assignmentId: existingAssignment.id,
        selectedPoolItemId: existingAssignment.selectedPoolItemId,
        selectionStrategy: existingAssignment.selectionStrategy || 'uniform',
        inventoryOperationId: existingInventoryOperations[0]?.id || '',
        inventoryStatus: existingInventoryOperations[0]?.status || 'pending',
        wasExistingAssignment: true,
      };
    }

    const blindBox = await this.dependencies.blindBoxRepository.findById(shop, mapping.blindBoxId);
    if (!blindBox || blindBox.status !== 'active') {
      return toAssignmentFailure(
        mapping.blindBoxId,
        lineItem.id,
        orderId,
        'BLIND_BOX_NOT_ACTIVE',
        'Mapped blind box is missing or not active',
      );
    }

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

    let assignment = existingAssignment;
    if (!assignment) {
      try {
        assignment = await this.dependencies.blindBoxAssignmentService.createAssignment(shop, {
          blindBoxId: blindBox.id,
          orderId,
          orderLineId: lineItem.id,
          selectedPoolItemId: selectedPoolItem.id,
          status: 'inventory_pending',
          selectionStrategy: blindBox.selectionStrategy,
          idempotencyKey: createIdempotencyKey(shop, orderId, lineItem.id),
          metadata: assignmentMetadata,
        });
      } catch (error) {
        if (error instanceof ValidationError) {
          return toAssignmentFailure(blindBox.id, lineItem.id, orderId, 'INVALID_WEIGHTING', error.message);
        }

        const concurrentAssignment = await this.dependencies.blindBoxAssignmentRepository.findByOrderLine(
          shop,
          orderId,
          lineItem.id,
        );

        if (concurrentAssignment?.selectedPoolItemId) {
          const concurrentInventoryOperations =
            await this.dependencies.inventoryOperationService.listInventoryOperationsForAssignment(
              shop,
              concurrentAssignment.id,
            );

          return {
            blindBoxId: concurrentAssignment.blindBoxId,
            lineItemId: lineItem.id,
            orderId,
            assignmentId: concurrentAssignment.id,
            selectedPoolItemId: concurrentAssignment.selectedPoolItemId,
            selectionStrategy: concurrentAssignment.selectionStrategy || blindBox.selectionStrategy,
            inventoryOperationId: concurrentInventoryOperations[0]?.id || '',
            inventoryStatus: concurrentInventoryOperations[0]?.status || 'pending',
            wasExistingAssignment: true,
          };
        }

        throw error;
      }
    }

    const inventoryOperation = await this.dependencies.inventoryOperationService.createInventoryOperation(shop, {
      blindBoxId: blindBox.id,
      assignmentId: assignment.id,
      poolItemId: selectedPoolItem.id,
      operationType: 'commit',
      status: 'pending',
      externalReference: createIdempotencyKey(shop, orderId, lineItem.id),
      reason: 'Blind-box assignment committed for paid order line',
      metadata: JSON.stringify({
        orderId,
        orderLineId: lineItem.id,
        selectedPoolItemId: selectedPoolItem.id,
      }),
    });

    if (this.dependencies.inventoryExecutionMode === 'execute') {
      try {
        await this.dependencies.inventoryGateway.commit({
          shop,
          poolItemId: selectedPoolItem.id,
          quantity: 1,
          reason: 'blind_box_assignment',
          idempotencyKey: createIdempotencyKey(shop, orderId, lineItem.id),
        });

        assignment = await this.dependencies.blindBoxAssignmentService.updateAssignmentStatus(
          shop,
          assignment.id,
          'inventory_committed',
        );

        await this.dependencies.inventoryOperationService.updateInventoryOperationStatus(
          shop,
          inventoryOperation.id,
          'completed',
        );

        return {
          blindBoxId: blindBox.id,
          lineItemId: lineItem.id,
          orderId,
          assignmentId: assignment.id,
          selectedPoolItemId: selectedPoolItem.id,
          selectionStrategy: blindBox.selectionStrategy,
          inventoryOperationId: inventoryOperation.id,
          inventoryStatus: 'completed',
          wasExistingAssignment: false,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown inventory workflow failure';
        await this.dependencies.blindBoxAssignmentService.updateAssignmentStatus(
          shop,
          assignment.id,
          'inventory_failed',
          JSON.stringify({
            orderLine: summarizeLineItem(lineItem),
            inventoryError: errorMessage,
          }),
        );

        await this.dependencies.inventoryOperationService.updateInventoryOperationStatus(
          shop,
          inventoryOperation.id,
          'failed',
          {
            reason: errorMessage,
          },
        );

        this.dependencies.logger.error('Inventory workflow failed for blind-box assignment', {
          shop,
          blindBoxId: blindBox.id,
          orderId,
          orderLineId: lineItem.id,
          assignmentId: assignment.id,
          inventoryOperationId: inventoryOperation.id,
          errorMessage,
        });

        return toAssignmentFailure(
          blindBox.id,
          lineItem.id,
          orderId,
          'INVENTORY_WORKFLOW_FAILURE',
          errorMessage,
        );
      }
    }

    this.dependencies.logger.info('Deferred inventory workflow for blind-box assignment', {
      shop,
      blindBoxId: blindBox.id,
      orderId,
      orderLineId: lineItem.id,
      assignmentId: assignment.id,
      inventoryOperationId: inventoryOperation.id,
    });

    return {
      blindBoxId: blindBox.id,
      lineItemId: lineItem.id,
      orderId,
      assignmentId: assignment.id,
      selectedPoolItemId: selectedPoolItem.id,
      selectionStrategy: blindBox.selectionStrategy,
      inventoryOperationId: inventoryOperation.id,
      inventoryStatus: 'pending',
      wasExistingAssignment: false,
    };
  }
}

export async function getPaidOrderAssignmentService(): Promise<PaidOrderAssignmentService> {
  const blindBoxRepository = await getBlindBoxRepository();
  const blindBoxPoolItemRepository = await getBlindBoxPoolItemRepository();
  const blindBoxProductMappingRepository = await getBlindBoxProductMappingRepository();
  const blindBoxAssignmentRepository = await getBlindBoxAssignmentRepository();
  const blindBoxAssignmentService = new BlindBoxAssignmentService(blindBoxAssignmentRepository);
  const inventoryOperationService = await getInventoryOperationService();
  const runtimeConfig = getRuntimeConfig();

  return new PaidOrderAssignmentService({
    blindBoxRepository,
    blindBoxPoolItemRepository,
    blindBoxProductMappingRepository,
    blindBoxAssignmentRepository,
    blindBoxAssignmentService,
    inventoryOperationService,
    inventoryGateway: new UnimplementedInventoryGateway(),
    logger,
    random: Math.random,
    inventoryExecutionMode: runtimeConfig.blindBoxInventoryExecutionMode,
  });
}
