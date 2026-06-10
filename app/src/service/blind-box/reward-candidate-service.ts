import { BlindBox, BlindBoxPoolItem, ExcludedRewardCandidate, RewardCandidate } from '../../domain/blind-box/types';

import { ShoplineInventoryGateway } from '../../integration/shopline/inventory-gateway';
import type { ShopAdminAccessTokenProvider } from '../../lib/shop-admin-access-token';
import { Logger, logger } from '../../lib/logger';
import {
  BlindBoxPoolItemRepository,
  getBlindBoxPoolItemRepository,
} from '../../repository/blind-box-pool-item-repository';
import { BlindBoxRepository, getBlindBoxRepository } from '../../repository/blind-box-repository';
import { getShoplineCatalogService, ShoplineCatalogService } from '../shopline/catalog-service';

const INACTIVE_PRODUCT_STATUSES = new Set(['draft', 'archived', 'inactive', 'disabled']);

interface CandidateVariantLike {
  id: string;
  title: string | null;
  inventoryQuantity: number | null;
  tracked: boolean | null;
  available: boolean | null;
}

/**
 * Inventory-weighted reward preview for a blind box. Candidates come from the
 * box's pool (blind_box_pool_items); each candidate's `selectionWeight` is its
 * CURRENT live inventory, so downstream weighted selection yields
 * P(item) = item_stock / Σ item_stock. Out-of-stock items are excluded.
 */
export interface RewardCandidatePreview {
  blindBox: BlindBox;
  /** Total reward products configured in the pool. */
  poolSize: number;
  /** How many pool items are eligible (active + in stock). */
  inStockCount: number;
  eligibleCandidates: RewardCandidate[];
  excludedCandidates: ExcludedRewardCandidate[];
}

export interface RewardCandidateServiceDependencies {
  blindBoxRepository: BlindBoxRepository;
  poolItemRepository: BlindBoxPoolItemRepository;
  catalogService: ShoplineCatalogService;
  inventoryGateway: ShoplineInventoryGateway;
  accessTokenProvider: ShopAdminAccessTokenProvider;
  logger: Logger;
  random: () => number;
}

function buildExcludedCandidate(
  reason: string,
  message: string,
  options: Partial<ExcludedRewardCandidate> = {},
): ExcludedRewardCandidate {
  return {
    productId: options.productId || null,
    variantId: options.variantId || null,
    productTitle: options.productTitle || null,
    variantTitle: options.variantTitle || null,
    imageUrl: options.imageUrl ?? null,
    reason,
    message,
    productStatus: options.productStatus ?? null,
    inventoryQuantity: options.inventoryQuantity ?? null,
    variantCount: options.variantCount ?? null,
  };
}

function isProductOperationallyActive(product: {
  status: string | null;
  published: boolean | null;
}): boolean {
  if (product.status && INACTIVE_PRODUCT_STATUSES.has(product.status.toLowerCase())) {
    return false;
  }

  if (product.published === false) {
    return false;
  }

  return true;
}

function isVariantCandidateAvailable(variant: CandidateVariantLike): boolean {
  if (variant.available === false) {
    return false;
  }

  if (variant.inventoryQuantity !== null && variant.inventoryQuantity <= 0) {
    return false;
  }

  return true;
}

function chooseVariant(
  variants: CandidateVariantLike[],
  random: () => number = Math.random,
): {
  variant?: CandidateVariantLike;
  eligibleVariantCount: number;
  exclusion?: { reason: string; message: string };
} {
  if (!variants.length) {
    return {
      eligibleVariantCount: 0,
      exclusion: {
        reason: 'NO_VARIANTS',
        message: 'The SHOPLINE product does not expose any variants that can be assigned',
      },
    };
  }

  const availableVariants = variants.filter(isVariantCandidateAvailable);
  if (availableVariants.length === 0) {
    return {
      eligibleVariantCount: 0,
      exclusion: {
        reason: 'OUT_OF_STOCK',
        message: `Every visible variant is unavailable or out of stock (${variants.length} variant${variants.length !== 1 ? 's' : ''} checked)`,
      },
    };
  }

  const idx = Math.min(Math.floor(random() * availableVariants.length), availableVariants.length - 1);
  return {
    variant: availableVariants[idx],
    eligibleVariantCount: availableVariants.length,
  };
}

export class RewardCandidateService {
  constructor(private readonly dependencies: RewardCandidateServiceDependencies) {}

  async previewCandidatesForBlindBox(
    shop: string,
    blindBoxId: string,
    options: {
      accessToken?: string;
    } = {},
  ): Promise<RewardCandidatePreview> {
    const blindBox = await this.dependencies.blindBoxRepository.findById(shop, blindBoxId);
    if (!blindBox) {
      throw new Error('Blind-box reference not found');
    }

    const poolItems = await this.dependencies.poolItemRepository.listByBlindBoxId(shop, blindBoxId);
    const eligibleCandidates: RewardCandidate[] = [];
    const excludedCandidates: ExcludedRewardCandidate[] = [];

    for (const poolItem of poolItems) {
      const result = await this.buildCandidateForPoolItem(shop, blindBox, poolItem, options);
      if ('candidate' in result) {
        eligibleCandidates.push(result.candidate);
      } else {
        excludedCandidates.push(result.excluded);
      }
    }

    this.dependencies.logger.info('Resolved blind-box reward candidates from pool', {
      shop,
      blindBoxId: blindBox.id,
      poolSize: poolItems.length,
      eligibleCandidateCount: eligibleCandidates.length,
      excludedCandidateCount: excludedCandidates.length,
    });

    return {
      blindBox,
      poolSize: poolItems.length,
      inStockCount: eligibleCandidates.length,
      eligibleCandidates,
      excludedCandidates,
    };
  }

  private async buildCandidateForPoolItem(
    shop: string,
    blindBox: BlindBox,
    poolItem: BlindBoxPoolItem,
    options: { accessToken?: string },
  ): Promise<{ candidate: RewardCandidate } | { excluded: ExcludedRewardCandidate }> {
    // A blind box can never reward its own trigger product.
    if (blindBox.triggerProductId && poolItem.rewardProductId === blindBox.triggerProductId) {
      return {
        excluded: buildExcludedCandidate(
          'SELF_REWARD_PRODUCT',
          'The trigger product cannot also be a reward in its own pool',
          { productId: poolItem.rewardProductId, productTitle: poolItem.rewardTitleSnapshot },
        ),
      };
    }

    let product;
    try {
      product = await this.dependencies.catalogService.getProduct(shop, poolItem.rewardProductId, {
        accessToken: options.accessToken,
      });
    } catch (error) {
      return {
        excluded: buildExcludedCandidate(
          'PRODUCT_FETCH_FAILED',
          error instanceof Error ? error.message : 'Failed to load the reward product from SHOPLINE',
          { productId: poolItem.rewardProductId, productTitle: poolItem.rewardTitleSnapshot },
        ),
      };
    }

    const variantCount = product.variants.length;

    if (!isProductOperationallyActive(product)) {
      return {
        excluded: buildExcludedCandidate(
          'INACTIVE_PRODUCT',
          `Product status is "${product.status ?? 'unknown'}" — only active/published products are eligible`,
          { productId: product.id, productTitle: product.title, imageUrl: product.imageUrl, productStatus: product.status, variantCount },
        ),
      };
    }

    // Pick the variant: the merchant-selected one if set, else weight within the
    // product by availability.
    let variant: CandidateVariantLike | undefined;
    let eligibleVariantCount = 1;
    if (poolItem.rewardVariantId) {
      variant = product.variants.find((candidate) => candidate.id === poolItem.rewardVariantId);
      if (!variant) {
        return {
          excluded: buildExcludedCandidate(
            'VARIANT_NOT_FOUND',
            'The selected reward variant no longer exists on the SHOPLINE product',
            { productId: product.id, productTitle: product.title, variantCount },
          ),
        };
      }
    } else {
      const variantChoice = chooseVariant(product.variants, this.dependencies.random);
      if (!variantChoice.variant) {
        return {
          excluded: buildExcludedCandidate(variantChoice.exclusion!.reason, variantChoice.exclusion!.message, {
            productId: product.id,
            productTitle: product.title,
            productStatus: product.status,
            variantCount,
            inventoryQuantity: product.variants[0]?.inventoryQuantity ?? null,
          }),
        };
      }
      variant = variantChoice.variant;
      eligibleVariantCount = variantChoice.eligibleVariantCount;
    }

    const inventoryQuantity = variant.inventoryQuantity;
    if (inventoryQuantity === null || inventoryQuantity <= 0) {
      return {
        excluded: buildExcludedCandidate(
          'OUT_OF_STOCK',
          'The reward variant is out of stock and cannot be selected',
          {
            productId: product.id,
            productTitle: product.title,
            imageUrl: product.imageUrl,
            variantId: variant.id,
            variantTitle: variant.title,
            productStatus: product.status,
            variantCount,
            inventoryQuantity,
          },
        ),
      };
    }

    const candidate: RewardCandidate = {
      productId: product.id,
      variantId: variant.id,
      productTitle: product.title ?? poolItem.rewardTitleSnapshot,
      variantTitle: variant.title,
      imageUrl: product.imageUrl,
      inventoryQuantity,
      // INVENTORY-WEIGHTED: weight = current stock → P = stock / Σ stock.
      selectionWeight: inventoryQuantity,
      eligibleVariantCount,
      payloadJson: JSON.stringify({
        poolItemId: poolItem.id,
        product: { id: product.id, title: product.title, status: product.status, published: product.published },
        variant: {
          id: variant.id,
          title: variant.title,
          inventoryQuantity: variant.inventoryQuantity,
          tracked: variant.tracked,
          available: variant.available,
        },
      }),
    };

    // NOTE: eligibility + odds are PRODUCT-LEVEL only (active/published + stock > 0).
    // Inventory-execution/location readiness is a SEPARATE, fulfillment-time concern
    // and must NOT exclude candidates here — otherwise odds and activation would
    // wrongly depend on BLIND_BOX_SHOPLINE_LOCATION_ID being configured.
    return { candidate };
  }
}

export async function getRewardCandidateService(): Promise<RewardCandidateService> {
  const { ShoplineSessionAccessTokenProvider } = await import('../../lib/shop-admin-access-token');
  const blindBoxRepository = await getBlindBoxRepository();
  const poolItemRepository = await getBlindBoxPoolItemRepository();
  const catalogService = await getShoplineCatalogService();

  return new RewardCandidateService({
    blindBoxRepository,
    poolItemRepository,
    catalogService,
    inventoryGateway: new ShoplineInventoryGateway(),
    accessTokenProvider: new ShoplineSessionAccessTokenProvider(),
    logger,
    random: Math.random,
  });
}
