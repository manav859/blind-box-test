import { BlindBoxAssignment, BlindBoxPoolItem, CreateInventoryOperationInput, InventoryOperation } from '../../domain/blind-box/types';
import { canExecuteInventoryOperation } from '../../domain/blind-box/inventory-state-machine';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors';
import { logger, Logger } from '../../lib/logger';
import {
  InventoryGateway,
  InventoryGatewayError,
  InventoryAdjustmentResult,
  ShoplineInventoryGateway,
} from '../../integration/shopline/inventory-gateway';
import type { ShopAdminAccessTokenProvider } from '../../lib/shop-admin-access-token';
import {
  BlindBoxAssignmentRepository,
  getBlindBoxAssignmentRepository,
} from '../../repository/blind-box-assignment-repository';
import {
  BlindBoxPoolItemRepository,
  getBlindBoxPoolItemRepository,
} from '../../repository/blind-box-pool-item-repository';
import {
  getInventoryOperationRepository,
  InventoryOperationRepository,
} from '../../repository/inventory-operation-repository';
import {
  getInventoryExecutionRepository,
  InventoryExecutionRepository,
} from '../../repository/inventory-execution-repository';
import { InventoryOperationService, getInventoryOperationService } from './inventory-operation-service';
import {
  buildInitialOperationMetadata,
  withAttemptEntry,
  withInventorySummary,
} from './inventory-metadata';
import {
  getInventoryExecutionReadinessService,
  InventoryExecutionReadinessReport,
  InventoryExecutionReadinessService,
} from './inventory-execution-readiness-service';

export interface EnsureCommitOperationInput {
  blindBoxId: string;
  assignmentId: string;
  poolItemId?: string | null;
  rewardGroupId?: string | null;
  rewardProductId?: string | null;
  rewardVariantId?: string | null;
  rewardTitleSnapshot?: string | null;
  rewardVariantTitleSnapshot?: string | null;
  orderId: string;
  orderLineId: string;
  idempotencyKey: string;
  metadata?: string | null;
}

export interface InventoryExecutionRewardTarget {
  productId: string | null;
  variantId: string | null;
  titleSnapshot: string | null;
  variantTitleSnapshot: string | null;
}

export interface InventoryExecutionContext {
  operation: InventoryOperation;
  assignment: BlindBoxAssignment;
  poolItem: BlindBoxPoolItem | null;
  rewardTarget: InventoryExecutionRewardTarget;
}

export interface InventoryExecutionResult extends InventoryExecutionContext {
  outcome: 'succeeded' | 'failed' | 'processing' | 'noop';
  gatewayResult?: InventoryAdjustmentResult | null;
  message?: string;
}

export interface InventoryExecutionOptions {
  accessToken?: string;
  trigger: 'webhook' | 'manual_retry';
}

export interface InventoryExecutionServiceDependencies {
  inventoryOperationService: InventoryOperationService;
  inventoryOperationRepository: InventoryOperationRepository;
  inventoryExecutionRepository: InventoryExecutionRepository;
  blindBoxAssignmentRepository: BlindBoxAssignmentRepository;
  blindBoxPoolItemRepository: BlindBoxPoolItemRepository;
  inventoryExecutionReadinessService: InventoryExecutionReadinessService;
  inventoryGateway: InventoryGateway;
  accessTokenProvider: ShopAdminAccessTokenProvider;
  logger: Logger;
}

function toFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown inventory execution failure';
}

function getFailureDisposition(error: unknown): 'definitive' | 'indeterminate' {
  if (error instanceof InventoryGatewayError) {
    return error.disposition;
  }

  return 'definitive';
}

export class InventoryExecutionService {
  constructor(private readonly dependencies: InventoryExecutionServiceDependencies) {}

  async ensureCommitOperationForAssignment(
    shop: string,
    input: EnsureCommitOperationInput,
  ): Promise<InventoryOperation> {
    const existingOperations = await this.dependencies.inventoryOperationService.listInventoryOperationsForAssignment(
      shop,
      input.assignmentId,
    );
    const existingCommitOperation = existingOperations.find((operation) => operation.operationType === 'commit');
    if (existingCommitOperation) {
      return existingCommitOperation;
    }

    const createInput: CreateInventoryOperationInput = {
      blindBoxId: input.blindBoxId,
      assignmentId: input.assignmentId,
      poolItemId: input.poolItemId,
      rewardGroupId: input.rewardGroupId,
      rewardProductId: input.rewardProductId,
      rewardVariantId: input.rewardVariantId,
      rewardTitleSnapshot: input.rewardTitleSnapshot,
      rewardVariantTitleSnapshot: input.rewardVariantTitleSnapshot,
      idempotencyKey: input.idempotencyKey,
      quantity: 1,
      operationType: 'commit',
      status: 'pending',
      externalReference: input.idempotencyKey,
      reason: 'Blind-box inventory execution pending',
      metadata: buildInitialOperationMetadata({
        orderId: input.orderId,
        orderLineId: input.orderLineId,
        assignmentId: input.assignmentId,
        blindBoxId: input.blindBoxId,
        poolItemId: input.poolItemId,
        rewardGroupId: input.rewardGroupId,
        rewardProductId: input.rewardProductId,
        rewardVariantId: input.rewardVariantId,
        createdBy: 'ensure_commit_operation',
        metadata: input.metadata,
      }),
    };

    try {
      return await this.dependencies.inventoryOperationService.createInventoryOperation(shop, createInput);
    } catch (error) {
      if (!(error instanceof ConflictError)) {
        throw error;
      }

      const operationByAssignment = (
        await this.dependencies.inventoryOperationService.listInventoryOperationsForAssignment(shop, input.assignmentId)
      ).find((operation) => operation.operationType === 'commit');
      if (operationByAssignment) {
        return operationByAssignment;
      }

      const operationByIdempotencyKey = await this.dependencies.inventoryOperationRepository.findByIdempotencyKey(
        shop,
        input.idempotencyKey,
      );
      if (!operationByIdempotencyKey) {
        throw error;
      }

      return operationByIdempotencyKey;
    }
  }

  async retryInventoryOperation(
    shop: string,
    operationId: string,
    options: Omit<InventoryExecutionOptions, 'trigger'> & {
      trigger?: InventoryExecutionOptions['trigger'];
    } = {},
  ): Promise<InventoryExecutionResult> {
    return this.executeInventoryOperation(shop, operationId, {
      accessToken: options.accessToken,
      trigger: options.trigger || 'manual_retry',
    });
  }

  async executeInventoryOperation(
    shop: string,
    operationId: string,
    options: InventoryExecutionOptions,
  ): Promise<InventoryExecutionResult> {
    const executionContext = await this.loadExecutionContext(shop, operationId);

    if (executionContext.operation.status === 'succeeded') {
      return {
        ...executionContext,
        outcome: 'noop',
        gatewayResult: null,
        message: 'Inventory operation already succeeded',
      };
    }

    if (executionContext.operation.status === 'processing') {
      return {
        ...executionContext,
        outcome: 'processing',
        gatewayResult: null,
        message:
          executionContext.operation.reason ||
          'Inventory operation is already processing and requires reconciliation before retry',
      };
    }

    if (!canExecuteInventoryOperation(executionContext.operation.status)) {
      throw new ConflictError(
        `Inventory operation cannot execute from status "${executionContext.operation.status}"`,
      );
    }

    const readinessReport = await this.dependencies.inventoryExecutionReadinessService.validateInventoryOperationExecutionReadiness(
      shop,
      operationId,
      {
        accessToken: options.accessToken,
      },
    );
    if (readinessReport.status !== 'ready') {
      return this.failOperationBeforeExecution(shop, executionContext, readinessReport, options.trigger);
    }

    const attemptNumber = executionContext.operation.attemptCount + 1;
    const attemptStartedAt = new Date().toISOString();
    const startedOperationMetadata = withAttemptEntry(
      executionContext.operation.metadata,
      {
        attemptNumber,
        trigger: options.trigger,
        startedAt: attemptStartedAt,
        state: 'processing',
      },
      {
        lastKnownState: 'processing',
        latestTrigger: options.trigger,
      },
    );
    const startedAssignmentMetadata = withInventorySummary(executionContext.assignment.metadata, {
      operationId: executionContext.operation.id,
      status: 'inventory_processing',
      lastAttemptedAt: attemptStartedAt,
      latestTrigger: options.trigger,
      lastError: null,
    });

    try {
      await this.dependencies.inventoryExecutionRepository.startExecution(
        shop,
        operationId,
        startedOperationMetadata,
        startedAssignmentMetadata,
      );
    } catch (error) {
      const message = toFailureMessage(error);
      await this.dependencies.inventoryExecutionRepository.markFailed(
        shop,
        operationId,
        message,
        withAttemptEntry(startedOperationMetadata, {
          attemptNumber,
          trigger: options.trigger,
          finishedAt: new Date().toISOString(),
          state: 'failed',
          reason: message,
          source: 'preflight',
        }),
        withInventorySummary(startedAssignmentMetadata, {
          status: 'inventory_failed',
          lastError: message,
        }),
        {
          releaseReservedQuantity: false,
        },
      );

      const failedContext = await this.loadExecutionContext(shop, operationId);
      return {
        ...failedContext,
        outcome: 'failed',
        gatewayResult: null,
        message,
      };
    }

    const startedContext = await this.loadExecutionContext(shop, operationId);
    const accessToken = options.accessToken || (await this.dependencies.accessTokenProvider.getAccessToken(shop));

    try {
      const gatewayResult = await this.dependencies.inventoryGateway.commit({
        shop,
        accessToken,
        poolItemId:
          startedContext.poolItem?.id ||
          `reward:${startedContext.rewardTarget.productId}:${startedContext.rewardTarget.variantId || 'product'}`,
        sourceProductId: startedContext.rewardTarget.productId,
        sourceVariantId: startedContext.rewardTarget.variantId,
        quantity: startedContext.operation.quantity,
        reason: 'blind_box_assignment',
        idempotencyKey: startedContext.operation.idempotencyKey,
      });

      await this.dependencies.inventoryExecutionRepository.markSucceeded(
        shop,
        operationId,
        withAttemptEntry(startedContext.operation.metadata, {
          attemptNumber,
          trigger: options.trigger,
          finishedAt: new Date().toISOString(),
          state: 'succeeded',
          traceId: gatewayResult.traceId,
        }, {
          gateway: {
            inventoryItemId: gatewayResult.inventoryItemId,
            locationId: gatewayResult.locationId,
            variantId: gatewayResult.variantId,
            traceId: gatewayResult.traceId,
          },
          lastKnownState: 'succeeded',
        }),
        withInventorySummary(startedContext.assignment.metadata, {
          status: 'inventory_committed',
          committedAt: new Date().toISOString(),
          lastError: null,
          gateway: {
            inventoryItemId: gatewayResult.inventoryItemId,
            locationId: gatewayResult.locationId,
            variantId: gatewayResult.variantId,
            traceId: gatewayResult.traceId,
          },
        }),
      );

      const succeededContext = await this.loadExecutionContext(shop, operationId);
      return {
        ...succeededContext,
        outcome: 'succeeded',
        gatewayResult,
      };
    } catch (error) {
      const message = toFailureMessage(error);
      const disposition = getFailureDisposition(error);

      if (disposition === 'indeterminate') {
        await this.dependencies.inventoryExecutionRepository.markIndeterminate(
          shop,
          operationId,
          message,
          withAttemptEntry(startedContext.operation.metadata, {
            attemptNumber,
            trigger: options.trigger,
            finishedAt: new Date().toISOString(),
            state: 'processing',
            reason: message,
            disposition,
          }, {
            lastKnownState: 'processing',
          }),
          withInventorySummary(startedContext.assignment.metadata, {
            status: 'inventory_processing',
            lastError: message,
            requiresManualReconciliation: true,
          }),
        );

        const indeterminateContext = await this.loadExecutionContext(shop, operationId);
        this.dependencies.logger.error('Inventory execution entered indeterminate processing state', {
          shop,
          operationId,
          assignmentId: indeterminateContext.assignment.id,
          poolItemId: indeterminateContext.poolItem?.id || null,
          rewardProductId: indeterminateContext.rewardTarget.productId,
          message,
        });

        return {
          ...indeterminateContext,
          outcome: 'processing',
          gatewayResult: null,
          message,
        };
      }

      await this.dependencies.inventoryExecutionRepository.markFailed(
        shop,
        operationId,
        message,
        withAttemptEntry(startedContext.operation.metadata, {
          attemptNumber,
          trigger: options.trigger,
          finishedAt: new Date().toISOString(),
          state: 'failed',
          reason: message,
          disposition,
        }, {
          lastKnownState: 'failed',
        }),
        withInventorySummary(startedContext.assignment.metadata, {
          status: 'inventory_failed',
          lastError: message,
        }),
        {
          releaseReservedQuantity: true,
        },
      );

      const failedContext = await this.loadExecutionContext(shop, operationId);
      this.dependencies.logger.error('Inventory execution failed', {
        shop,
        operationId,
        assignmentId: failedContext.assignment.id,
        poolItemId: failedContext.poolItem?.id || null,
        rewardProductId: failedContext.rewardTarget.productId,
        message,
      });

      return {
        ...failedContext,
        outcome: 'failed',
        gatewayResult: null,
        message,
      };
    }
  }

  private async failOperationBeforeExecution(
    shop: string,
    executionContext: InventoryExecutionContext,
    readinessReport: InventoryExecutionReadinessReport,
    trigger: InventoryExecutionOptions['trigger'],
  ): Promise<InventoryExecutionResult> {
    const failureTimestamp = new Date().toISOString();
    await this.dependencies.inventoryExecutionRepository.markFailed(
      shop,
      executionContext.operation.id,
      readinessReport.summary,
      withAttemptEntry(
        executionContext.operation.metadata,
        {
          attemptNumber: executionContext.operation.attemptCount + 1,
          trigger,
          finishedAt: failureTimestamp,
          state: 'failed',
          source: 'readiness_validation',
          reason: readinessReport.summary,
          readiness: readinessReport,
        },
        {
          lastKnownState: 'failed',
          latestTrigger: trigger,
          readiness: readinessReport,
        },
      ),
      withInventorySummary(executionContext.assignment.metadata, {
        status: 'inventory_failed',
        lastError: readinessReport.summary,
        lastValidation: readinessReport,
      }),
      {
        releaseReservedQuantity: false,
        incrementAttemptCount: true,
      },
    );

    const failedContext = await this.loadExecutionContext(shop, executionContext.operation.id);
    this.dependencies.logger.error('Inventory execution readiness validation failed', {
      shop,
      operationId: failedContext.operation.id,
      assignmentId: failedContext.assignment.id,
      poolItemId: failedContext.poolItem?.id || null,
      rewardProductId: failedContext.rewardTarget.productId,
      readinessSummary: readinessReport.summary,
      readinessIssues: readinessReport.issues,
    });

    return {
      ...failedContext,
      outcome: 'failed',
      gatewayResult: null,
      message: readinessReport.summary,
    };
  }

  private async loadExecutionContext(shop: string, operationId: string): Promise<InventoryExecutionContext> {
    const operation = await this.dependencies.inventoryOperationRepository.findById(shop, operationId);
    if (!operation) {
      throw new NotFoundError('Inventory operation not found');
    }

    if (!operation.assignmentId) {
      throw new ValidationError('Inventory operation is missing an assignment id');
    }

    const assignment = await this.dependencies.blindBoxAssignmentRepository.findById(shop, operation.assignmentId);
    if (!assignment) {
      throw new NotFoundError('Blind-box assignment not found for inventory operation');
    }

    const poolItem = operation.poolItemId
      ? await this.dependencies.blindBoxPoolItemRepository.findById(shop, operation.poolItemId)
      : null;
    if (operation.poolItemId && !poolItem) {
      throw new NotFoundError('Blind-box pool item not found for inventory operation');
    }

    const rewardTarget: InventoryExecutionRewardTarget = {
      productId:
        operation.rewardProductId ||
        assignment.selectedRewardProductId ||
        poolItem?.sourceProductId ||
        null,
      variantId:
        operation.rewardVariantId ||
        assignment.selectedRewardVariantId ||
        poolItem?.sourceVariantId ||
        null,
      titleSnapshot:
        operation.rewardTitleSnapshot ||
        assignment.selectedRewardTitleSnapshot ||
        poolItem?.label ||
        null,
      variantTitleSnapshot:
        operation.rewardVariantTitleSnapshot ||
        assignment.selectedRewardVariantTitleSnapshot ||
        null,
    };

    if (!rewardTarget.productId) {
      throw new ValidationError('Inventory operation is missing a reward product id or legacy source product id');
    }

    return {
      operation,
      assignment,
      poolItem,
      rewardTarget,
    };
  }
}

export async function getInventoryExecutionService(): Promise<InventoryExecutionService> {
  const { ShoplineSessionAccessTokenProvider } = await import('../../lib/shop-admin-access-token');
  const inventoryOperationService = await getInventoryOperationService();
  const inventoryOperationRepository = await getInventoryOperationRepository();
  const inventoryExecutionRepository = await getInventoryExecutionRepository();
  const blindBoxAssignmentRepository = await getBlindBoxAssignmentRepository();
  const blindBoxPoolItemRepository = await getBlindBoxPoolItemRepository();
  const inventoryExecutionReadinessService = await getInventoryExecutionReadinessService();

  return new InventoryExecutionService({
    inventoryOperationService,
    inventoryOperationRepository,
    inventoryExecutionRepository,
    blindBoxAssignmentRepository,
    blindBoxPoolItemRepository,
    inventoryExecutionReadinessService,
    inventoryGateway: new ShoplineInventoryGateway(),
    accessTokenProvider: new ShoplineSessionAccessTokenProvider(),
    logger,
  });
}
