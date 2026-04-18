import { BlindBoxAssignment, InventoryOperation } from '../../domain/blind-box/types';
import { Logger, logger } from '../../lib/logger';
import {
  AssignmentInventoryBoundaryRepository,
  getAssignmentInventoryBoundaryRepository,
  PersistAssignmentInventoryBoundaryInput,
} from '../../repository/assignment-inventory-boundary-repository';
import {
  BlindBoxAssignmentRepository,
  getBlindBoxAssignmentRepository,
} from '../../repository/blind-box-assignment-repository';
import {
  getInventoryOperationRepository,
  InventoryOperationRepository,
} from '../../repository/inventory-operation-repository';
import { NotFoundError } from '../../lib/errors';
import { buildInitialOperationMetadata } from './inventory-metadata';

export interface PersistAssignmentInventoryBoundaryServiceInput {
  blindBoxId: string;
  orderId: string;
  orderLineId: string;
  rewardGroupId?: string | null;
  selectedPoolItemId?: string | null;
  selectedRewardProductId?: string | null;
  selectedRewardVariantId?: string | null;
  selectedRewardTitleSnapshot?: string | null;
  selectedRewardVariantTitleSnapshot?: string | null;
  selectedRewardPayloadJson?: string | null;
  selectionStrategy: NonNullable<BlindBoxAssignment['selectionStrategy']>;
  idempotencyKey: string;
  assignmentMetadata: string | null;
}

export interface PersistAssignmentInventoryBoundaryServiceResult {
  assignment: BlindBoxAssignment;
  inventoryOperation: InventoryOperation;
  wasExistingAssignment: boolean;
  wasExistingInventoryOperation: boolean;
  recoveredMissingInventoryOperation: boolean;
}

export interface AssignmentInventoryBoundaryServiceDependencies {
  boundaryRepository: AssignmentInventoryBoundaryRepository;
  assignmentRepository: BlindBoxAssignmentRepository;
  inventoryOperationRepository: InventoryOperationRepository;
  logger: Logger;
}

export class AssignmentInventoryBoundaryService {
  constructor(private readonly dependencies: AssignmentInventoryBoundaryServiceDependencies) {}

  async persistAssignmentInventoryBoundary(
    shop: string,
    input: PersistAssignmentInventoryBoundaryServiceInput,
  ): Promise<PersistAssignmentInventoryBoundaryServiceResult> {
    const persistedBoundary = await this.dependencies.boundaryRepository.persistAssignmentInventoryBoundary(shop, {
      ...input,
      inventoryOperationMetadata: buildInitialOperationMetadata({
        orderId: input.orderId,
        orderLineId: input.orderLineId,
        assignmentId: 'pending-assignment-id',
        blindBoxId: input.blindBoxId,
        poolItemId: input.selectedPoolItemId,
        rewardGroupId: input.rewardGroupId,
        rewardProductId: input.selectedRewardProductId,
        rewardVariantId: input.selectedRewardVariantId,
        createdBy: 'paid_order_assignment',
      }),
    } satisfies PersistAssignmentInventoryBoundaryInput);

    const assignment = await this.dependencies.assignmentRepository.findById(
      shop,
      persistedBoundary.assignmentId,
    );
    if (!assignment) {
      throw new NotFoundError('Blind-box assignment was not found after boundary persistence');
    }

    const inventoryOperation = await this.dependencies.inventoryOperationRepository.findById(
      shop,
      persistedBoundary.inventoryOperationId,
    );
    if (!inventoryOperation) {
      throw new NotFoundError('Inventory operation was not found after boundary persistence');
    }

    if (inventoryOperation.metadata?.includes('"pending-assignment-id"')) {
      const metadata = buildInitialOperationMetadata({
        orderId: input.orderId,
        orderLineId: input.orderLineId,
        assignmentId: assignment.id,
        blindBoxId: assignment.blindBoxId,
        poolItemId: assignment.selectedPoolItemId || input.selectedPoolItemId,
        rewardGroupId: assignment.rewardGroupId || input.rewardGroupId,
        rewardProductId: assignment.selectedRewardProductId || input.selectedRewardProductId,
        rewardVariantId: assignment.selectedRewardVariantId || input.selectedRewardVariantId,
        createdBy: persistedBoundary.recoveredMissingInventoryOperation
          ? 'boundary_recovery'
          : persistedBoundary.wasExistingAssignment
          ? 'assignment_replay'
          : 'paid_order_assignment',
      });

      await this.dependencies.inventoryOperationRepository.updateStatus(
        shop,
        inventoryOperation.id,
        inventoryOperation.status,
        {
          metadata,
          reason: inventoryOperation.reason,
          externalReference: inventoryOperation.externalReference,
        },
      );
    }

    const refreshedInventoryOperation = await this.dependencies.inventoryOperationRepository.findById(
      shop,
      persistedBoundary.inventoryOperationId,
    );
    if (!refreshedInventoryOperation) {
      throw new NotFoundError('Inventory operation disappeared after metadata refresh');
    }

    this.dependencies.logger.info('Persisted blind-box assignment to inventory boundary', {
      shop,
      orderId: input.orderId,
      orderLineId: input.orderLineId,
      assignmentId: assignment.id,
      inventoryOperationId: refreshedInventoryOperation.id,
      wasExistingAssignment: persistedBoundary.wasExistingAssignment,
      wasExistingInventoryOperation: persistedBoundary.wasExistingInventoryOperation,
      recoveredMissingInventoryOperation: persistedBoundary.recoveredMissingInventoryOperation,
    });

    return {
      assignment,
      inventoryOperation: refreshedInventoryOperation,
      wasExistingAssignment: persistedBoundary.wasExistingAssignment,
      wasExistingInventoryOperation: persistedBoundary.wasExistingInventoryOperation,
      recoveredMissingInventoryOperation: persistedBoundary.recoveredMissingInventoryOperation,
    };
  }
}

export async function getAssignmentInventoryBoundaryService(): Promise<AssignmentInventoryBoundaryService> {
  const boundaryRepository = await getAssignmentInventoryBoundaryRepository();
  const assignmentRepository = await getBlindBoxAssignmentRepository();
  const inventoryOperationRepository = await getInventoryOperationRepository();

  return new AssignmentInventoryBoundaryService({
    boundaryRepository,
    assignmentRepository,
    inventoryOperationRepository,
    logger,
  });
}
