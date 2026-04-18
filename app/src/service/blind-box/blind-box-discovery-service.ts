import { ShoplineProduct } from '../../integration/shopline/catalog-gateway';
import { isBlindBoxProduct } from '../../domain/blind-box/product-detection';
import { BlindBox } from '../../domain/blind-box/types';
import { ConflictError } from '../../lib/errors';
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
      const productResult = await this.dependencies.catalogService.listAllProducts(shop, {
        accessToken: options.accessToken,
      });
      const resolvedBlindBoxes = new Map(existingBlindBoxes.map((blindBox) => [blindBox.id, blindBox]));

      for (const product of productResult.products) {
        if (!isBlindBoxProduct(product)) {
          continue;
        }

        const blindBox = await this.ensureBlindBoxForDetectedProduct(shop, product);
        resolvedBlindBoxes.set(blindBox.id, blindBox);
      }

      return sortBlindBoxes([...resolvedBlindBoxes.values()]);
    } catch (error) {
      this.dependencies.logger.warn('Failed to refresh detected SHOPLINE blind-box products; using local cache only', {
        shop,
        error: error instanceof Error ? error.message : String(error),
      });

      return sortBlindBoxes(existingBlindBoxes);
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
          status: 'active',
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
