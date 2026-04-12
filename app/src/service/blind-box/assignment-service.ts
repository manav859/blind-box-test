import { BlindBoxAssignment, CreateBlindBoxAssignmentInput } from '../../domain/blind-box/types';
import { validateCreateBlindBoxAssignmentInput } from '../../domain/blind-box/validation';
import {
  BlindBoxAssignmentRepository,
  getBlindBoxAssignmentRepository,
} from '../../repository/blind-box-assignment-repository';

export class BlindBoxAssignmentService {
  constructor(private readonly assignmentRepository: BlindBoxAssignmentRepository) {}

  async createAssignment(shop: string, input: CreateBlindBoxAssignmentInput): Promise<BlindBoxAssignment> {
    const normalizedInput = validateCreateBlindBoxAssignmentInput(input);
    return this.assignmentRepository.create(shop, normalizedInput);
  }

  async listAssignments(shop: string): Promise<BlindBoxAssignment[]> {
    return this.assignmentRepository.listByShop(shop);
  }

  async updateAssignmentStatus(
    shop: string,
    assignmentId: string,
    status: BlindBoxAssignment['status'],
    metadata?: string | null,
  ): Promise<BlindBoxAssignment> {
    return this.assignmentRepository.updateStatus(shop, assignmentId, status, metadata);
  }

  async findAssignmentByOrderLine(
    shop: string,
    orderId: string,
    orderLineId: string,
  ): Promise<BlindBoxAssignment | null> {
    return this.assignmentRepository.findByOrderLine(shop, orderId, orderLineId);
  }
}

export async function getBlindBoxAssignmentService(): Promise<BlindBoxAssignmentService> {
  const repository = await getBlindBoxAssignmentRepository();
  return new BlindBoxAssignmentService(repository);
}
