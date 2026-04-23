import { CatalogGateway, ShoplineCatalogGateway, ShoplineCollection, ShoplineProduct } from '../../integration/shopline/catalog-gateway';
export type { ShoplineCollection, ShoplineProduct } from '../../integration/shopline/catalog-gateway';
import type { ShopAdminAccessTokenProvider } from '../../lib/shop-admin-access-token';
import { Logger, logger } from '../../lib/logger';

export interface ShoplineCatalogServiceDependencies {
  catalogGateway: CatalogGateway;
  accessTokenProvider: ShopAdminAccessTokenProvider;
  logger: Logger;
}

export class ShoplineCatalogService {
  constructor(private readonly dependencies: ShoplineCatalogServiceDependencies) {}

  async getProduct(
    shop: string,
    productId: string,
    options: {
      accessToken?: string;
    } = {},
  ): Promise<ShoplineProduct> {
    const accessToken = await this.resolveAccessToken(shop, options.accessToken);
    const product = await this.dependencies.catalogGateway.getProduct(shop, accessToken, productId);

    this.dependencies.logger.info('Fetched SHOPLINE product for blind-box configuration', {
      shop,
      productId: product.id,
      variantCount: product.variants.length,
    });

    return product;
  }

  async getCollection(
    shop: string,
    collectionId: string,
    options: {
      accessToken?: string;
    } = {},
  ): Promise<ShoplineCollection> {
    const accessToken = await this.resolveAccessToken(shop, options.accessToken);
    const collection = await this.dependencies.catalogGateway.getCollection(shop, accessToken, collectionId);

    this.dependencies.logger.info('Fetched SHOPLINE collection for blind-box configuration', {
      shop,
      collectionId: collection.id,
    });

    return collection;
  }

  async getCollectionByHandle(
    shop: string,
    handle: string,
    options: {
      accessToken?: string;
    } = {},
  ): Promise<ShoplineCollection> {
    const accessToken = await this.resolveAccessToken(shop, options.accessToken);
    const collection = await this.dependencies.catalogGateway.getCollectionByHandle(shop, accessToken, handle);

    this.dependencies.logger.info('Fetched SHOPLINE collection by handle for blind-box reward resolution', {
      shop,
      collectionHandle: collection.handle || handle,
      collectionId: collection.id,
    });

    return collection;
  }

  async listAllCollectionProducts(
    shop: string,
    collectionId: string,
    options: {
      accessToken?: string;
      limitPerPage?: number;
    } = {},
  ): Promise<{
    collection: ShoplineCollection;
    products: ShoplineProduct[];
    traceIds: string[];
  }> {
    const accessToken = await this.resolveAccessToken(shop, options.accessToken);
    const collection = await this.dependencies.catalogGateway.getCollection(shop, accessToken, collectionId);
    const products: ShoplineProduct[] = [];
    const traceIds: string[] = [];
    let pageInfo: string | null = null;

    do {
      const page = await this.dependencies.catalogGateway.getCollectionProductsPage(
        shop,
        accessToken,
        collection.id,
        {
          pageInfo,
          limit: options.limitPerPage,
        },
      );

      products.push(...page.products);
      if (page.traceId) {
        traceIds.push(page.traceId);
      }
      pageInfo = page.nextPageInfo;
    } while (pageInfo);

    this.dependencies.logger.info('Fetched SHOPLINE collection products for blind-box reward resolution', {
      shop,
      collectionId: collection.id,
      productCount: products.length,
    });

    return {
      collection,
      products,
      traceIds,
    };
  }

  async listAllProducts(
    shop: string,
    options: {
      accessToken?: string;
      limitPerPage?: number;
    } = {},
  ): Promise<{
    products: ShoplineProduct[];
    traceIds: string[];
  }> {
    const accessToken = await this.resolveAccessToken(shop, options.accessToken);
    const products: ShoplineProduct[] = [];
    const traceIds: string[] = [];
    let pageInfo: string | null = null;

    do {
      const page = await this.dependencies.catalogGateway.getProductsPage(shop, accessToken, {
        pageInfo,
        limit: options.limitPerPage,
      });

      products.push(...page.products);
      if (page.traceId) {
        traceIds.push(page.traceId);
      }
      pageInfo = page.nextPageInfo;
    } while (pageInfo);

    this.dependencies.logger.info('Fetched SHOPLINE products for blind-box detection', {
      shop,
      productCount: products.length,
    });

    return {
      products,
      traceIds,
    };
  }

  async listAllCollections(
    shop: string,
    options: {
      accessToken?: string;
    } = {},
  ): Promise<{
    collections: ShoplineCollection[];
    traceIds: string[];
  }> {
    const accessToken = await this.resolveAccessToken(shop, options.accessToken);
    const collections: ShoplineCollection[] = [];
    const traceIds: string[] = [];
    let pageInfo: string | null = null;

    do {
      const page = await this.dependencies.catalogGateway.getCollectionsPage(shop, accessToken, {
        pageInfo,
      });

      collections.push(...page.collections);
      if (page.traceId) {
        traceIds.push(page.traceId);
      }
      pageInfo = page.nextPageInfo;
    } while (pageInfo);

    this.dependencies.logger.info('Fetched SHOPLINE collections for blind-box configuration', {
      shop,
      collectionCount: collections.length,
    });

    return { collections, traceIds };
  }

  private async resolveAccessToken(shop: string, accessToken?: string): Promise<string> {
    if (accessToken) {
      return accessToken;
    }

    return this.dependencies.accessTokenProvider.getAccessToken(shop);
  }
}

export async function getShoplineCatalogService(): Promise<ShoplineCatalogService> {
  const { ShoplineSessionAccessTokenProvider } = await import('../../lib/shop-admin-access-token');

  return new ShoplineCatalogService({
    catalogGateway: new ShoplineCatalogGateway(),
    accessTokenProvider: new ShoplineSessionAccessTokenProvider(),
    logger,
  });
}
