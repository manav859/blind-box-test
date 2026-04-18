import { validateUpsertBlindBoxRewardGroupLinkInput } from '../../domain/blind-box/validation';
import {
  BlindBoxRewardGroupLink,
  UpsertBlindBoxRewardGroupLinkInput,
} from '../../domain/blind-box/types';
import {
  BlindBoxRewardGroupLinkRepository,
  getBlindBoxRewardGroupLinkRepository,
} from '../../repository/blind-box-reward-group-link-repository';

export class BlindBoxRewardGroupLinkService {
  constructor(private readonly linkRepository: BlindBoxRewardGroupLinkRepository) {}

  async upsertLink(
    shop: string,
    input: UpsertBlindBoxRewardGroupLinkInput,
  ): Promise<BlindBoxRewardGroupLink> {
    const normalizedInput = validateUpsertBlindBoxRewardGroupLinkInput(input);
    return this.linkRepository.upsert(shop, normalizedInput);
  }

  async listLinks(shop: string): Promise<BlindBoxRewardGroupLink[]> {
    return this.linkRepository.listByShop(shop);
  }

  async getLinkByBlindBoxId(shop: string, blindBoxId: string): Promise<BlindBoxRewardGroupLink | null> {
    return this.linkRepository.findByBlindBoxId(shop, blindBoxId);
  }
}

export async function getBlindBoxRewardGroupLinkService(): Promise<BlindBoxRewardGroupLinkService> {
  const repository = await getBlindBoxRewardGroupLinkRepository();
  return new BlindBoxRewardGroupLinkService(repository);
}
