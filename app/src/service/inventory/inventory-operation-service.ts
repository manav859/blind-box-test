import { CreateInventoryOperationInput, InventoryOperation } from '../../domain/blind-box/types';
import { validateCreateInventoryOperationInput } from '../../domain/blind-box/validation';
import {
  getInventoryOperationRepository,
  InventoryOperationRepository,
} from '../../repository/inventory-operation-repository';

export class InventoryOperationService {
  constructor(private readonly inventoryOperationRepository: InventoryOperationRepository) {}

  async createInventoryOperation(
    shop: string,
    input: CreateInventoryOperationInput,
  ): Promise<InventoryOperation> {
    const normalizedInput = validateCreateInventoryOperationInput(input);
    return this.inventoryOperationRepository.create(shop, normalizedInput);
  }

  async listInventoryOperations(shop: string): Promise<InventoryOperation[]> {
    return this.inventoryOperationRepository.listByShop(shop);
  }

  async getInventoryOperation(shop: string, operationId: string): Promise<InventoryOperation | null> {
    return this.inventoryOperationRepository.findById(shop, operationId);
  }

  async listInventoryOperationsForAssignment(shop: string, assignmentId: string): Promise<InventoryOperation[]> {
    return this.inventoryOperationRepository.findByAssignmentId(shop, assignmentId);
  }

  async updateInventoryOperationStatus(
    shop: string,
    operationId: string,
    status: InventoryOperation['status'],
    updates?: {
      reason?: string | null;
      metadata?: string | null;
      externalReference?: string | null;
    },
  ): Promise<InventoryOperation> {
    return this.inventoryOperationRepository.updateStatus(shop, operationId, status, updates);
  }
}

export async function getInventoryOperationService(): Promise<InventoryOperationService> {
  const repository = await getInventoryOperationRepository();
  return new InventoryOperationService(repository);
}
