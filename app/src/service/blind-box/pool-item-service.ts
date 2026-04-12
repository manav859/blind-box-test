import { BlindBoxPoolItem, UpsertBlindBoxPoolItemInput } from '../../domain/blind-box/types';
import { validateUpsertBlindBoxPoolItemInput } from '../../domain/blind-box/validation';
import {
  BlindBoxPoolItemRepository,
  getBlindBoxPoolItemRepository,
} from '../../repository/blind-box-pool-item-repository';

export class BlindBoxPoolItemService {
  constructor(private readonly blindBoxPoolItemRepository: BlindBoxPoolItemRepository) {}

  async upsertPoolItem(shop: string, input: UpsertBlindBoxPoolItemInput): Promise<BlindBoxPoolItem> {
    const normalizedInput = validateUpsertBlindBoxPoolItemInput(input);
    return this.blindBoxPoolItemRepository.upsert(shop, normalizedInput);
  }

  async listPoolItems(shop: string, blindBoxId: string): Promise<BlindBoxPoolItem[]> {
    return this.blindBoxPoolItemRepository.listByBlindBoxId(shop, blindBoxId);
  }
}

export async function getBlindBoxPoolItemService(): Promise<BlindBoxPoolItemService> {
  const repository = await getBlindBoxPoolItemRepository();
  return new BlindBoxPoolItemService(repository);
}
