import { extractRawTagFields, ShoplineProduct } from '../../integration/shopline/catalog-gateway';
import {
  getSupportedBlindBoxProductTags,
  isBlindBoxProduct,
} from '../../domain/blind-box/product-detection';
import { BlindBox } from '../../domain/blind-box/types';
import { ConflictError, SessionExpiredError } from '../../lib/errors';
import { Logger, logger } from '../../lib/logger';
import { BlindBoxRepository, getBlindBoxRepository } from '../../repository/blind-box-repository';
import { getShoplineCatalogService, ShoplineCatalogService } from '../shopline/catalog-service';

export interface BlindBoxDiscoveryServiceDependencies {
  blindBoxRepository: BlindBoxRepository;
  catalogService: ShoplineCatalogService;
  logger: Logger;
}

function sortBlindBoxes(blindBoxes: BlindBox[]): BlindBox[] {
  return [...blindBoxes].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

/**
 * Confirm a product really is a blind box. FAIL CLOSED: a product is only a
 * blind box if it explicitly carries a supported blind-box tag (case-insensitive).
 * An empty or absent tag list is NEVER trusted — the previous "trust the
 * server-side ?tag= filter" shortcut misclassified every untagged product as a
 * blind box whenever SHOPLINE silently ignored the filter.
 */
function isConfirmedBlindBoxProduct(product: ShoplineProduct): boolean {
  return isBlindBoxProduct(product);
}

/**
 * True when the list payload actually carried a tag field for this product
 * (any known variant: tags, tag_list, labels, categories, …). When this is
 * false the SHOPLINE list projection/filter dropped tags entirely, so the
 * product's tag list is unreliable and must be re-confirmed via a detail fetch.
 */
function listPayloadHasTagsField(product: ShoplineProduct): boolean {
  const raw = product.raw;
  if (!raw || typeof raw !== 'object') {
    return false;
  }

  return Object.keys(extractRawTagFields(raw as Record<string, unknown>)).length > 0;
}

function selectExistingBlindBoxReference(
  blindBoxes: BlindBox[],
  productVariantId?: string | null,
): BlindBox | null {
  const normalizedVariantId = productVariantId?.trim() || null;

  if (normalizedVariantId) {
    const exactVariantMatch = blindBoxes.find((blindBox) => blindBox.shoplineVariantId === normalizedVariantId);
    if (exactVariantMatch) {
      return exactVariantMatch;
    }
  }

  const productLevelReference = blindBoxes.find((blindBox) => !blindBox.shoplineVariantId);
  if (productLevelReference) {
    return productLevelReference;
  }

  return blindBoxes[0] || null;
}

export class BlindBoxDiscoveryService {
  constructor(private readonly dependencies: BlindBoxDiscoveryServiceDependencies) {}

  async listDetectedBlindBoxes(
    shop: string,
    options: {
      accessToken?: string;
    } = {},
  ): Promise<BlindBox[]> {
    const existingBlindBoxes = await this.dependencies.blindBoxRepository.listByShop(shop);

    try {
      // Query SHOPLINE once per supported blind-box tag using the server-side
      // `?tag=` filter (e.g. tag=blind-box). Each call paginates through every
      // page, and we de-duplicate by product id since a product may carry more
      // than one supported tag.
      const detectedProducts = new Map<string, ShoplineProduct>();

      for (const tag of getSupportedBlindBoxProductTags()) {
        const productResult = await this.dependencies.catalogService.listAllProducts(shop, {
          accessToken: options.accessToken,
          tag,
        });

        for (const product of productResult.products) {
          const confirmed = await this.confirmDetectedBlindBoxProduct(shop, product, options.accessToken);
          if (confirmed) {
            detectedProducts.set(confirmed.id, confirmed);
          }
        }
      }

      const resolvedBlindBoxes = new Map(existingBlindBoxes.map((blindBox) => [blindBox.id, blindBox]));

      for (const product of detectedProducts.values()) {
        const blindBox = await this.ensureBlindBoxForDetectedProduct(shop, product);
        resolvedBlindBoxes.set(blindBox.id, blindBox);
      }

      return sortBlindBoxes([...resolvedBlindBoxes.values()]);
    } catch (error) {
      // An expired/invalid SHOPLINE token must NOT be hidden behind the local
      // cache — that produces a silently-empty product list. Propagate it so the
      // route returns a 401 and the merchant is sent to re-authenticate.
      if (error instanceof SessionExpiredError) {
        this.dependencies.logger.warn('Blind-box discovery aborted — SHOPLINE session expired; forcing re-auth', {
          shop,
        });
        throw error;
      }

      this.dependencies.logger.warn('Failed to refresh detected SHOPLINE blind-box products; using local cache only', {
        shop,
        error: error instanceof Error ? error.message : String(error),
      });

      return sortBlindBoxes(existingBlindBoxes);
    }
  }

  /**
   * Decide whether a product returned by the list endpoint is a blind box,
   * returning the authoritative product record when it is (or null when it is not).
   *
   * - Tags present in the list payload → apply the strict tag check directly.
   * - Tags ABSENT from the list payload → the SHOPLINE projection/filter dropped
   *   tags, so we must NOT assume anything. Re-fetch the product detail (which
   *   reliably includes tags) and apply the strict check against that. A warning
   *   is logged so a misbehaving SHOPLINE filter/projection is detectable.
   */
  private async confirmDetectedBlindBoxProduct(
    shop: string,
    product: ShoplineProduct,
    accessToken?: string,
  ): Promise<ShoplineProduct | null> {
    if (listPayloadHasTagsField(product)) {
      return isConfirmedBlindBoxProduct(product) ? product : null;
    }

    this.dependencies.logger.warn(
      'Blind-box list payload missing tags field — refetching product detail before confirming',
      {
        shop,
        productId: product.id,
      },
    );

    try {
      const detail = await this.dependencies.catalogService.getProduct(shop, product.id, { accessToken });
      return isConfirmedBlindBoxProduct(detail) ? detail : null;
    } catch (error) {
      // An expired token must surface so the caller forces re-auth — never
      // swallow it into a silent "not a blind box".
      if (error instanceof SessionExpiredError) {
        throw error;
      }

      this.dependencies.logger.warn(
        'Failed to refetch product detail for blind-box confirmation — treating as NOT a blind box',
        {
          shop,
          productId: product.id,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return null;
    }
  }

  async ensureBlindBoxForDetectedProduct(
    shop: string,
    product: ShoplineProduct,
    options: {
      productVariantId?: string | null;
    } = {},
  ): Promise<BlindBox> {
    const existingBlindBoxes = await this.dependencies.blindBoxRepository.listByShoplineProductId(shop, product.id);
    const existingBlindBox = selectExistingBlindBoxReference(existingBlindBoxes, options.productVariantId);

    if (!existingBlindBox) {
      try {
        const createdBlindBox = await this.dependencies.blindBoxRepository.create(shop, {
          name: product.title || `Blind Box ${product.id}`,
          description: null,
          // Auto-detected boxes start as DRAFT — never live or reward-eligible
          // until the merchant configures a reward pool AND explicitly activates.
          status: 'draft',
          selectionStrategy: 'uniform',
          shoplineProductId: product.id,
          shoplineVariantId: null,
          productTitleSnapshot: product.title || null,
          configJson: null,
        });

        this.dependencies.logger.info('Auto-hydrated blind-box cache record from detected SHOPLINE product', {
          shop,
          blindBoxId: createdBlindBox.id,
          productId: product.id,
        });

        return createdBlindBox;
      } catch (error) {
        if (!(error instanceof ConflictError)) {
          throw error;
        }

        const conflictedBlindBoxes = await this.dependencies.blindBoxRepository.listByShoplineProductId(shop, product.id);
        const conflictedBlindBox = selectExistingBlindBoxReference(conflictedBlindBoxes, options.productVariantId);
        if (conflictedBlindBox) {
          return conflictedBlindBox;
        }

        throw error;
      }
    }

    const nextProductTitleSnapshot = product.title || null;
    const shouldRefreshSnapshot = existingBlindBox.productTitleSnapshot !== nextProductTitleSnapshot;
    const shouldRefreshName =
      Boolean(nextProductTitleSnapshot) &&
      (existingBlindBox.name === existingBlindBox.productTitleSnapshot || !existingBlindBox.name.trim());

    if (!shouldRefreshSnapshot && !shouldRefreshName) {
      return existingBlindBox;
    }

    return this.dependencies.blindBoxRepository.update(shop, existingBlindBox.id, {
      name: shouldRefreshName ? (nextProductTitleSnapshot as string) : existingBlindBox.name,
      description: existingBlindBox.description,
      status: existingBlindBox.status,
      selectionStrategy: existingBlindBox.selectionStrategy,
      shoplineProductId: existingBlindBox.shoplineProductId,
      shoplineVariantId: existingBlindBox.shoplineVariantId,
      productTitleSnapshot: nextProductTitleSnapshot,
      configJson: existingBlindBox.configJson,
    });
  }
}

export async function getBlindBoxDiscoveryService(): Promise<BlindBoxDiscoveryService> {
  const blindBoxRepository = await getBlindBoxRepository();
  const catalogService = await getShoplineCatalogService();

  return new BlindBoxDiscoveryService({
    blindBoxRepository,
    catalogService,
    logger,
  });
}
