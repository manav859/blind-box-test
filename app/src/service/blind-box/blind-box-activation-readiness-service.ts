import { BlindBox, ExcludedRewardCandidate, RewardCandidate } from '../../domain/blind-box/types';
import { NotFoundError, ValidationError } from '../../lib/errors';
import { Logger, logger } from '../../lib/logger';
import { BlindBoxRepository, getBlindBoxRepository } from '../../repository/blind-box-repository';
import { getRewardCandidateService, RewardCandidateService } from './reward-candidate-service';

export interface BlindBoxActivationReadinessIssue {
  code: string;
  message: string;
}

export interface BlindBoxActivationReadinessReport {
  status: 'ready' | 'not_ready';
  blindBox: BlindBox;
  poolSize: number;
  inStockCount: number;
  eligibleCandidates: RewardCandidate[];
  excludedCandidates: ExcludedRewardCandidate[];
  issues: BlindBoxActivationReadinessIssue[];
  summary: string;
}

export interface BlindBoxActivationReadinessServiceDependencies {
  blindBoxRepository: BlindBoxRepository;
  rewardCandidateService: RewardCandidateService;
  logger: Logger;
}

export class BlindBoxActivationReadinessService {
  constructor(private readonly dependencies: BlindBoxActivationReadinessServiceDependencies) {}

  async getReadinessReport(
    shop: string,
    blindBoxId: string,
    options: {
      accessToken?: string;
    } = {},
  ): Promise<BlindBoxActivationReadinessReport> {
    const blindBox = await this.dependencies.blindBoxRepository.findById(shop, blindBoxId);
    if (!blindBox) {
      throw new NotFoundError('Blind-box reference not found');
    }

    const issues: BlindBoxActivationReadinessIssue[] = [];

    if (!blindBox.triggerProductId) {
      issues.push({
        code: 'TRIGGER_PRODUCT_MISSING',
        message: 'Pick the product customers buy (the trigger product) before activating.',
      });
    }

    const preview = await this.dependencies.rewardCandidateService.previewCandidatesForBlindBox(
      shop,
      blindBox.id,
      options,
    );

    if (preview.poolSize === 0) {
      issues.push({
        code: 'EMPTY_POOL',
        message: 'Add at least one reward product to the pool before activating.',
      });
    } else if (preview.inStockCount === 0) {
      issues.push({
        code: 'NO_REWARD_IN_STOCK',
        message:
          'No reward product in the pool is currently in stock. Restock at least one reward before activating.',
      });
    }

    const summary =
      issues[0]?.message ||
      `Ready — ${preview.inStockCount} of ${preview.poolSize} reward product(s) in stock and eligible.`;

    return {
      status: issues.length === 0 ? 'ready' : 'not_ready',
      blindBox,
      poolSize: preview.poolSize,
      inStockCount: preview.inStockCount,
      eligibleCandidates: preview.eligibleCandidates,
      excludedCandidates: preview.excludedCandidates,
      issues,
      summary,
    };
  }

  async assertReadyForActivation(
    shop: string,
    blindBoxId: string,
    options: {
      accessToken?: string;
    } = {},
  ): Promise<void> {
    const report = await this.getReadinessReport(shop, blindBoxId, options);
    if (report.status === 'ready') {
      return;
    }

    throw new ValidationError(report.summary);
  }
}

export async function getBlindBoxActivationReadinessService(): Promise<BlindBoxActivationReadinessService> {
  const blindBoxRepository = await getBlindBoxRepository();
  const rewardCandidateService = await getRewardCandidateService();

  return new BlindBoxActivationReadinessService({
    blindBoxRepository,
    rewardCandidateService,
    logger,
  });
}
