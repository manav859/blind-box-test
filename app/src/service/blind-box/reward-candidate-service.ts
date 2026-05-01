import {
  getBlindBoxProductTags,
  hasBlindBoxCollectionTag,
  parseBlindBoxCollectionTag,
  parseBlindBoxWeightTag,
} from '../../domain/blind-box/product-detection';
import { BlindBox, ExcludedRewardCandidate, RewardCandidate, RewardGroup } from '../../domain/blind-box/types';
import { CatalogGatewayError } from '../../integration/shopline/catalog-gateway';
import { ShoplineInventoryGateway, InventoryGatewayError } from '../../integration/shopline/inventory-gateway';
import { getRuntimeConfig } from '../../lib/config';
import type { ShopAdminAccessTokenProvider } from '../../lib/shop-admin-access-token';
import { Logger, logger } from '../../lib/logger';
import {
  BlindBoxRewardGroupLinkRepository,
  getBlindBoxRewardGroupLinkRepository,
} from '../../repository/blind-box-reward-group-link-repository';
import { BlindBoxRepository, getBlindBoxRepository } from '../../repository/blind-box-repository';
import { getRewardGroupRepository, RewardGroupRepository } from '../../repository/reward-group-repository';
import { getShoplineCatalogService, ShoplineCatalogService } from '../shopline/catalog-service';

const INACTIVE_PRODUCT_STATUSES = new Set(['draft', 'archived', 'inactive', 'disabled']);

interface CandidateVariantLike {
  id: string;
  title: string | null;
  inventoryQuantity: number | null;
  tracked: boolean | null;
  available: boolean | null;
}

export interface RewardCandidatePreview {
  blindBox: BlindBox;
  rewardGroup: RewardGroup | null;
  collection: {
    id: string;
    title: string | null;
    handle: string | null;
  };
  resolutionSource: 'product_tag' | 'reward_group_link';
  rawCollectionSize: number;
  eligibleCandidates: RewardCandidate[];
  excludedCandidates: ExcludedRewardCandidate[];
}

export interface RewardCandidateServiceDependencies {
  blindBoxRepository: BlindBoxRepository;
  rewardGroupRepository: RewardGroupRepository;
  rewardGroupLinkRepository: BlindBoxRewardGroupLinkRepository;
  catalogService: ShoplineCatalogService;
  inventoryGateway: ShoplineInventoryGateway;
  accessTokenProvider: ShopAdminAccessTokenProvider;
  logger: Logger;
  random: () => number;
}

type RewardCandidateResolutionErrorCode =
  | 'BLIND_BOX_COLLECTION_NOT_CONFIGURED'
  | 'BLIND_BOX_COLLECTION_TAG_INVALID'
  | 'BLIND_BOX_COLLECTION_NOT_FOUND'
  | 'BLIND_BOX_REWARD_GROUP_MISSING';

export class RewardCandidateResolutionError extends Error {
  constructor(
    readonly code: RewardCandidateResolutionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RewardCandidateResolutionError';
  }
}

interface RewardCollectionContext {
  rewardGroup: RewardGroup | null;
  collection: {
    id: string;
    title: string | null;
    handle: string | null;
  };
  resolutionSource: 'product_tag' | 'reward_group_link';
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
    reason,
    message,
    productStatus: options.productStatus ?? null,
    inventoryQuantity: options.inventoryQuantity ?? null,
    variantCount: options.variantCount ?? null,
  };
}

function isBlindBoxProduct(productId: string, blindBox: BlindBox): boolean {
  return Boolean(blindBox.shoplineProductId) && blindBox.shoplineProductId === productId;
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

  // Pick uniformly at random — variant selection is always uniform regardless
  // of the blind-box product selection strategy (which applies to products).
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
    const collectionContext = await this.resolveRewardCollectionContext(shop, blindBox, options);
    const collectionResult = await this.dependencies.catalogService.listAllCollectionProducts(
      shop,
      collectionContext.collection.id,
      {
        accessToken: options.accessToken,
      },
    );

    const eligibleCandidates: RewardCandidate[] = [];
    const excludedCandidates: ExcludedRewardCandidate[] = [];

    for (const product of collectionResult.products) {
      const variantCount = product.variants.length;
      const firstVariantQty = product.variants[0]?.inventoryQuantity ?? null;

      if (isBlindBoxProduct(product.id, blindBox)) {
        excludedCandidates.push(
          buildExcludedCandidate(
            'SELF_REWARD_PRODUCT',
            'The blind-box product cannot be present in its own reward collection',
            { productId: product.id, productTitle: product.title, productStatus: product.status, variantCount },
          ),
        );
        continue;
      }

      if (!isProductOperationallyActive(product)) {
        excludedCandidates.push(
          buildExcludedCandidate(
            'INACTIVE_PRODUCT',
            `Product status is "${product.status ?? 'unknown'}" — only active/published products are eligible`,
            { productId: product.id, productTitle: product.title, productStatus: product.status, variantCount },
          ),
        );
        continue;
      }

      const variantChoice = chooseVariant(product.variants, this.dependencies.random);
      if (!variantChoice.variant) {
        const outOfStockQty = variantChoice.exclusion!.reason === 'OUT_OF_STOCK' ? firstVariantQty : null;
        excludedCandidates.push(
          buildExcludedCandidate(variantChoice.exclusion!.reason, variantChoice.exclusion!.message, {
            productId: product.id,
            productTitle: product.title,
            productStatus: product.status,
            variantCount,
            inventoryQuantity: outOfStockQty,
          }),
        );
        continue;
      }

      const candidate: RewardCandidate = {
        productId: product.id,
        variantId: variantChoice.variant.id,
        productTitle: product.title,
        variantTitle: variantChoice.variant.title,
        inventoryQuantity: variantChoice.variant.inventoryQuantity,
        eligibleVariantCount: variantChoice.eligibleVariantCount,
        selectionWeight: parseBlindBoxWeightTag(Array.isArray(product.tags) ? product.tags : []),
        payloadJson: JSON.stringify({
          collectionId: collectionContext.collection.id,
          collectionHandle: collectionContext.collection.handle,
          resolutionSource: collectionContext.resolutionSource,
          product: {
            id: product.id,
            title: product.title,
            status: product.status,
            published: product.published,
          },
          variant: {
            id: variantChoice.variant.id,
            title: variantChoice.variant.title,
            inventoryQuantity: variantChoice.variant.inventoryQuantity,
            tracked: variantChoice.variant.tracked,
            available: variantChoice.variant.available,
          },
        }),
      };

      const operationalExclusion = await this.validateCandidateOperationalReadiness(
        shop,
        candidate,
        {
          accessToken: options.accessToken,
        },
      );
      if (operationalExclusion) {
        excludedCandidates.push(operationalExclusion);
        continue;
      }

      eligibleCandidates.push(candidate);
    }

    this.dependencies.logger.info('Resolved blind-box reward candidates from SHOPLINE collection', {
      shop,
      blindBoxId: blindBox.id,
      rewardGroupId: collectionContext.rewardGroup?.id || null,
      collectionId: collectionContext.collection.id,
      collectionHandle: collectionContext.collection.handle,
      resolutionSource: collectionContext.resolutionSource,
      rawCollectionSize: collectionResult.products.length,
      eligibleCandidateCount: eligibleCandidates.length,
      excludedCandidateCount: excludedCandidates.length,
    });

    return {
      blindBox,
      rewardGroup: collectionContext.rewardGroup,
      collection: {
        id: collectionResult.collection.id,
        title: collectionResult.collection.title,
        handle: collectionResult.collection.handle,
      },
      resolutionSource: collectionContext.resolutionSource,
      rawCollectionSize: collectionResult.products.length,
      eligibleCandidates,
      excludedCandidates,
    };
  }

  private async resolveRewardCollectionContext(
    shop: string,
    blindBox: BlindBox,
    options: {
      accessToken?: string;
    },
  ): Promise<RewardCollectionContext> {
    if (!blindBox.shoplineProductId) {
      throw new RewardCandidateResolutionError(
        'BLIND_BOX_COLLECTION_NOT_CONFIGURED',
        'Blind-box reference is missing its SHOPLINE product id',
      );
    }

    const product = await this.dependencies.catalogService.getProduct(shop, blindBox.shoplineProductId, {
      accessToken: options.accessToken,
    });
    const productTags = getBlindBoxProductTags(product);
    const collectionHandle = parseBlindBoxCollectionTag(productTags);

    if (collectionHandle) {
      // resolveCollectionBySlug tries GraphQL collectionByHandle first, then
      // falls back to REST title-slug matching.  This handles the case where
      // SHOPLINE does not expose a handle field on the collection (the GraphQL
      // query returns null) but the collection can still be matched by title.
      const collection = await this.dependencies.catalogService.resolveCollectionBySlug(
        shop,
        collectionHandle,
        { accessToken: options.accessToken },
      );

      if (collection) {
        return {
          rewardGroup: null,
          collection: { id: collection.id, title: collection.title, handle: collection.handle },
          resolutionSource: 'product_tag',
        };
      }

      throw new RewardCandidateResolutionError(
        'BLIND_BOX_COLLECTION_NOT_FOUND',
        `The blind-box product tag points to a SHOPLINE collection that could not be resolved: "${collectionHandle}". ` +
        'Verify the collection exists in SHOPLINE Admin.',
      );
    }

    if (hasBlindBoxCollectionTag(productTags)) {
      throw new RewardCandidateResolutionError(
        'BLIND_BOX_COLLECTION_TAG_INVALID',
        'The blind-box product has a "blind-box-collection:" tag but the collection handle is empty. ' +
        'Fix the tag in SHOPLINE: e.g. "blind-box-collection:my-rewards".',
      );
    }

    throw new RewardCandidateResolutionError(
      'BLIND_BOX_COLLECTION_NOT_CONFIGURED',
      'No reward collection configured. Add tag "blind-box-collection:<handle>" to the blind-box product in SHOPLINE. ' +
      'The handle is the collection URL slug (e.g. "blind-box-collection:anime-figures").',
    );
  }

  private async validateCandidateOperationalReadiness(
    shop: string,
    candidate: RewardCandidate,
    options: {
      accessToken?: string;
    },
  ): Promise<ExcludedRewardCandidate | null> {
    const runtimeConfig = getRuntimeConfig();
    if (runtimeConfig.blindBoxInventoryExecutionMode !== 'execute') {
      return null;
    }

    const accessToken = options.accessToken || (await this.dependencies.accessTokenProvider.getAccessToken(shop));

    try {
      await this.dependencies.inventoryGateway.validateExecutionReadiness({
        shop,
        accessToken,
        poolItemId: `reward:${candidate.productId}:${candidate.variantId || 'product'}`,
        sourceProductId: candidate.productId,
        sourceVariantId: candidate.variantId,
        quantity: 1,
        reason: 'blind_box_reward_candidate_validation',
        idempotencyKey: `validate:${shop}:${candidate.productId}:${candidate.variantId || 'product'}`,
        preferredLocationId: runtimeConfig.blindBoxShoplineLocationId,
      });
      return null;
    } catch (error) {
      if (error instanceof InventoryGatewayError) {
        return buildExcludedCandidate(
          'EXECUTION_NOT_READY',
          error.message,
          {
            productId: candidate.productId,
            variantId: candidate.variantId,
            productTitle: candidate.productTitle,
            variantTitle: candidate.variantTitle,
            inventoryQuantity: candidate.inventoryQuantity,
          },
        );
      }

      throw error;
    }
  }
}

export async function getRewardCandidateService(): Promise<RewardCandidateService> {
  const { ShoplineSessionAccessTokenProvider } = await import('../../lib/shop-admin-access-token');
  const blindBoxRepository = await getBlindBoxRepository();
  const rewardGroupRepository = await getRewardGroupRepository();
  const rewardGroupLinkRepository = await getBlindBoxRewardGroupLinkRepository();
  const catalogService = await getShoplineCatalogService();

  return new RewardCandidateService({
    blindBoxRepository,
    rewardGroupRepository,
    rewardGroupLinkRepository,
    catalogService,
    inventoryGateway: new ShoplineInventoryGateway(),
    accessTokenProvider: new ShoplineSessionAccessTokenProvider(),
    logger,
    random: Math.random,
  });
}
