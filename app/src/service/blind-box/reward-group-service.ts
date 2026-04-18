import { validateUpsertRewardGroupInput } from '../../domain/blind-box/validation';
import { RewardGroup, UpsertRewardGroupInput } from '../../domain/blind-box/types';
import { getRewardGroupRepository, RewardGroupRepository } from '../../repository/reward-group-repository';

export class RewardGroupService {
  constructor(private readonly rewardGroupRepository: RewardGroupRepository) {}

  async upsertRewardGroup(shop: string, input: UpsertRewardGroupInput): Promise<RewardGroup> {
    const normalizedInput = validateUpsertRewardGroupInput(input);
    return this.rewardGroupRepository.upsert(shop, normalizedInput);
  }

  async listRewardGroups(shop: string): Promise<RewardGroup[]> {
    return this.rewardGroupRepository.listByShop(shop);
  }

  async getRewardGroup(shop: string, rewardGroupId: string): Promise<RewardGroup | null> {
    return this.rewardGroupRepository.findById(shop, rewardGroupId);
  }
}

export async function getRewardGroupService(): Promise<RewardGroupService> {
  const repository = await getRewardGroupRepository();
  return new RewardGroupService(repository);
}
