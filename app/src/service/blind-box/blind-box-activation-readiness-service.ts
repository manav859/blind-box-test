import { evaluateEligiblePoolItems } from '../../domain/blind-box/selection';
import { BlindBox, ExcludedRewardCandidate, RewardCandidate, RewardGroup } from '../../domain/blind-box/types';
import { NotFoundError, ValidationError } from '../../lib/errors';
import { Logger, logger } from '../../lib/logger';
import {
  BlindBoxRewardGroupLinkRepository,
  getBlindBoxRewardGroupLinkRepository,
} from '../../repository/blind-box-reward-group-link-repository';
import { BlindBoxRepository, getBlindBoxRepository } from '../../repository/blind-box-repository';
import {
  BlindBoxPoolItemRepository,
  getBlindBoxPoolItemRepository,
} from '../../repository/blind-box-pool-item-repository';
import {
  BlindBoxProductMappingRepository,
  getBlindBoxProductMappingRepository,
} from '../../repository/blind-box-product-mapping-repository';
import { getRewardGroupRepository, RewardGroupRepository } from '../../repository/reward-group-repository';
import {
  getRewardCandidateService,
  RewardCandidateResolutionError,
  RewardCandidateService,
} from './reward-candidate-service';
import { getShoplineCatalogService, ShoplineCatalogService } from '../shopline/catalog-service';
import {
  getInventoryExecutionReadinessService,
  InventoryExecutionReadinessService,
} from '../inventory/inventory-execution-readiness-service';

export interface BlindBoxActivationReadinessIssue {
  code: string;
  message: string;
}

export interface BlindBoxActivationReadinessReport {
  status: 'ready' | 'not_ready';
  mode: 'collection_linked' | 'legacy_manual_pool';
  blindBox: BlindBox;
  rewardGroup: RewardGroup | null;
  resolutionSource: 'product_tag' | 'reward_group_link' | null;
  collection: {
    id: string;
    title: string | null;
    handle: string | null;
  } | null;
  rawCollectionSize: number;
  eligibleCandidates: RewardCandidate[];
  excludedCandidates: ExcludedRewardCandidate[];
  issues: BlindBoxActivationReadinessIssue[];
  summary: string;
}

export interface BlindBoxActivationReadinessServiceDependencies {
  blindBoxRepository: BlindBoxRepository;
  rewardGroupRepository: RewardGroupRepository;
  rewardGroupLinkRepository: BlindBoxRewardGroupLinkRepository;
  rewardCandidateService: RewardCandidateService;
  catalogService: ShoplineCatalogService;
  poolItemRepository: BlindBoxPoolItemRepository;
  productMappingRepository: BlindBoxProductMappingRepository;
  inventoryExecutionReadinessService: InventoryExecutionReadinessService;
  logger: Logger;
}

export class BlindBoxActivationReadinessService {
  constructor(
    private readonly dependencies: BlindBoxActivationReadinessServiceDependencies,
  ) {}

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

    if (blindBox.shoplineProductId) {
      return this.buildCollectionLinkedReport(shop, blindBox, options);
    }

    return this.buildLegacyReport(shop, blindBox, options);
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

  private async buildCollectionLinkedReport(
    shop: string,
    blindBox: BlindBox,
    options: {
      accessToken?: string;
    },
  ): Promise<BlindBoxActivationReadinessReport> {
    const issues: BlindBoxActivationReadinessIssue[] = [];
    let preview;
    try {
      preview = await this.dependencies.rewardCandidateService.previewCandidatesForBlindBox(
        shop,
        blindBox.id,
        options,
      );
    } catch (error) {
      if (error instanceof RewardCandidateResolutionError) {
        issues.push({
          code: error.code,
          message: error.message,
        });

        return {
          status: 'not_ready',
          mode: 'collection_linked',
          blindBox,
          rewardGroup: null,
          resolutionSource: null,
          collection: null,
          rawCollectionSize: 0,
          eligibleCandidates: [],
          excludedCandidates: [],
          issues,
          summary: issues[0].message,
        };
      }

      throw error;
    }

    if (preview.rawCollectionSize === 0) {
      issues.push({
        code: 'EMPTY_COLLECTION',
        message: 'The linked SHOPLINE collection does not contain any products',
      });
    }

    if (preview.eligibleCandidates.length === 0) {
      issues.push({
        code: 'NO_ELIGIBLE_CANDIDATES',
        message: 'The linked SHOPLINE collection does not currently expose any eligible reward candidates',
      });
    }

    const summary =
      issues[0]?.message ||
      `Blind-box product "${blindBox.name}" is ready with ${preview.eligibleCandidates.length} eligible reward candidate(s)`;

    return {
      status: issues.length === 0 ? 'ready' : 'not_ready',
      mode: 'collection_linked',
      blindBox,
      rewardGroup: preview.rewardGroup,
      resolutionSource: preview.resolutionSource,
      collection: preview.collection,
      rawCollectionSize: preview.rawCollectionSize,
      eligibleCandidates: preview.eligibleCandidates,
      excludedCandidates: preview.excludedCandidates,
      issues,
      summary,
    };
  }

  private async buildLegacyReport(
    shop: string,
    blindBox: BlindBox,
    options: {
      accessToken?: string;
    },
  ): Promise<BlindBoxActivationReadinessReport> {
    const issues: BlindBoxActivationReadinessIssue[] = [];
    const mappings = await this.dependencies.productMappingRepository.listByShop(shop);
    const enabledMappings = mappings.filter(
      (mapping) => mapping.blindBoxId === blindBox.id && mapping.enabled,
    );
    const poolItems = await this.dependencies.poolItemRepository.listByBlindBoxId(shop, blindBox.id);
    const { eligibleItems } = evaluateEligiblePoolItems(poolItems);

    if (!enabledMappings.length) {
      issues.push({
        code: 'LEGACY_PRODUCT_MAPPING_MISSING',
        message: 'Cannot activate this legacy blind box until an enabled sold-product mapping exists',
      });
    }

    if (!poolItems.length) {
      issues.push({
        code: 'LEGACY_POOL_EMPTY',
        message: 'Cannot activate this legacy blind box until at least one pool item exists',
      });
    } else if (!eligibleItems.length) {
      issues.push({
        code: 'LEGACY_POOL_NOT_ELIGIBLE',
        message: 'Cannot activate this legacy blind box until at least one enabled in-stock pool item exists',
      });
    }

    if (!issues.length) {
      for (const item of eligibleItems) {
        const report =
          await this.dependencies.inventoryExecutionReadinessService.validatePoolItemExecutionReadiness(
            shop,
            item.id,
            {
              accessToken: options.accessToken,
            },
          );

        if (report.status === 'ready') {
          this.dependencies.logger.warn('Legacy manual blind-box pool remains active in readiness flow', {
            shop,
            blindBoxId: blindBox.id,
          });
          return {
            status: 'ready',
            mode: 'legacy_manual_pool',
            blindBox,
            rewardGroup: null,
            resolutionSource: null,
            collection: null,
            rawCollectionSize: poolItems.length,
            eligibleCandidates: [],
            excludedCandidates: [],
            issues: [],
            summary: 'Legacy blind-box pool remains ready, but should be migrated to a SHOPLINE collection reward group',
          };
        }
      }

      issues.push({
        code: 'LEGACY_EXECUTE_MODE_NOT_READY',
        message:
          'Cannot activate this legacy blind box until at least one eligible pool item passes execute-mode readiness validation',
      });
    }

    return {
      status: 'not_ready',
      mode: 'legacy_manual_pool',
      blindBox,
      rewardGroup: null,
      resolutionSource: null,
      collection: null,
      rawCollectionSize: poolItems.length,
      eligibleCandidates: [],
      excludedCandidates: [],
      issues,
      summary: issues[0]?.message || 'Legacy blind-box readiness failed',
    };
  }
}

export async function getBlindBoxActivationReadinessService(): Promise<BlindBoxActivationReadinessService> {
  const blindBoxRepository = await getBlindBoxRepository();
  const rewardGroupRepository = await getRewardGroupRepository();
  const rewardGroupLinkRepository = await getBlindBoxRewardGroupLinkRepository();
  const rewardCandidateService = await getRewardCandidateService();
  const catalogService = await getShoplineCatalogService();
  const poolItemRepository = await getBlindBoxPoolItemRepository();
  const productMappingRepository = await getBlindBoxProductMappingRepository();
  const inventoryExecutionReadinessService = await getInventoryExecutionReadinessService();

  return new BlindBoxActivationReadinessService({
    blindBoxRepository,
    rewardGroupRepository,
    rewardGroupLinkRepository,
    rewardCandidateService,
    catalogService,
    poolItemRepository,
    productMappingRepository,
    inventoryExecutionReadinessService,
    logger,
  });
}
