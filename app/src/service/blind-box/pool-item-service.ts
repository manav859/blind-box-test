import { BlindBoxPoolItem, UpsertBlindBoxPoolItemInput } from '../../domain/blind-box/types';
import { validateUpsertBlindBoxPoolItemInput } from '../../domain/blind-box/validation';
import {
  BlindBoxPoolItemRepository,
  getBlindBoxPoolItemRepository,
} from '../../repository/blind-box-pool-item-repository';

export class BlindBoxPoolItemService {
  constructor(private readonly blindBoxPoolItemRepository: BlindBoxPoolItemRepository) {}

  /** Add (or update) a reward product in a blind box's pool. */
  async addReward(shop: string, input: UpsertBlindBoxPoolItemInput): Promise<BlindBoxPoolItem> {
    const normalizedInput = validateUpsertBlindBoxPoolItemInput(input);
    return this.blindBoxPoolItemRepository.upsert(shop, normalizedInput);
  }

  async listPoolItems(shop: string, blindBoxId: string): Promise<BlindBoxPoolItem[]> {
    return this.blindBoxPoolItemRepository.listByBlindBoxId(shop, blindBoxId);
  }

  /** Remove a reward product from a blind box's pool. */
  async removeReward(shop: string, blindBoxId: string, poolItemId: string): Promise<void> {
    return this.blindBoxPoolItemRepository.deleteById(shop, blindBoxId, poolItemId);
  }
}

export async function getBlindBoxPoolItemService(): Promise<BlindBoxPoolItemService> {
  const repository = await getBlindBoxPoolItemRepository();
  return new BlindBoxPoolItemService(repository);
}
