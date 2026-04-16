import {
  InventoryDebugGateway,
  InventoryDebugLocation,
  InventoryDebugProduct,
  InventoryDebugVariantInventory,
  InventoryGatewayError,
  ShoplineInventoryGateway,
} from '../../integration/shopline/inventory-gateway';
import { getRuntimeConfig } from '../../lib/config';
import { AppError } from '../../lib/errors';
import type { ShopAdminAccessTokenProvider } from '../../lib/shop-admin-access-token';
import { Logger, logger } from '../../lib/logger';

export interface InventoryStoreDebugServiceDependencies {
  inventoryDebugGateway: InventoryDebugGateway;
  accessTokenProvider: ShopAdminAccessTokenProvider;
  logger: Logger;
}

function toDebugAppError(error: InventoryGatewayError): AppError {
  const httpStatus =
    error.code === 'SHOPLINE_INVENTORY_HTTP_ERROR'
      ? Number((error.details as Record<string, unknown> | undefined)?.status) || 400
      : undefined;

  return new AppError({
    code: error.code,
    statusCode:
      httpStatus === 404
        ? 404
        : error.disposition === 'indeterminate'
          ? 502
          : 400,
    message: error.message,
    details: error.details,
    expose: true,
  });
}

export class InventoryStoreDebugService {
  constructor(private readonly dependencies: InventoryStoreDebugServiceDependencies) {}

  async listLocations(
    shop: string,
    options: {
      accessToken?: string;
    } = {},
  ): Promise<InventoryDebugLocation[]> {
    try {
      const accessToken = await this.resolveAccessToken(shop, options.accessToken);
      const locations = await this.dependencies.inventoryDebugGateway.listLocations({
        shop,
        accessToken,
      });

      this.dependencies.logger.info('Listed SHOPLINE debug locations for blind-box diagnostics', {
        shop,
        locationCount: locations.length,
      });

      return locations;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getProduct(
    shop: string,
    productId: string,
    options: {
      accessToken?: string;
    } = {},
  ): Promise<InventoryDebugProduct> {
    try {
      const accessToken = await this.resolveAccessToken(shop, options.accessToken);
      const product = await this.dependencies.inventoryDebugGateway.getProduct({
        shop,
        accessToken,
        productId,
      });

      this.dependencies.logger.info('Fetched SHOPLINE debug product for blind-box diagnostics', {
        shop,
        productId: product.productId,
        variantCount: product.variants.length,
      });

      return product;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getVariantInventory(
    shop: string,
    variantId: string,
    options: {
      accessToken?: string;
    } = {},
  ): Promise<InventoryDebugVariantInventory> {
    try {
      const accessToken = await this.resolveAccessToken(shop, options.accessToken);
      const runtimeConfig = getRuntimeConfig();
      const variantInventory = await this.dependencies.inventoryDebugGateway.getVariantInventory({
        shop,
        accessToken,
        variantId,
        preferredLocationId: runtimeConfig.blindBoxShoplineLocationId,
      });

      this.dependencies.logger.info('Fetched SHOPLINE debug variant inventory for blind-box diagnostics', {
        shop,
        variantId: variantInventory.variantId,
        inventoryItemId: variantInventory.inventoryItemId,
        linkedLocationIds: variantInventory.linkedLocationIds,
      });

      return variantInventory;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  private async resolveAccessToken(shop: string, accessToken?: string): Promise<string> {
    if (accessToken) {
      return accessToken;
    }

    return this.dependencies.accessTokenProvider.getAccessToken(shop);
  }

  private normalizeError(error: unknown): Error {
    if (error instanceof AppError) {
      return error;
    }

    if (error instanceof InventoryGatewayError) {
      return toDebugAppError(error);
    }

    if (error instanceof Error) {
      return error;
    }

    return new AppError({
      code: 'SHOPLINE_DEBUG_FAILED',
      statusCode: 500,
      message: 'Unable to complete SHOPLINE diagnostic request',
      details: error,
      expose: true,
    });
  }
}

export async function getInventoryStoreDebugService(): Promise<InventoryStoreDebugService> {
  const { ShoplineSessionAccessTokenProvider } = await import('../../lib/shop-admin-access-token');

  return new InventoryStoreDebugService({
    inventoryDebugGateway: new ShoplineInventoryGateway(),
    accessTokenProvider: new ShoplineSessionAccessTokenProvider(),
    logger,
  });
}
