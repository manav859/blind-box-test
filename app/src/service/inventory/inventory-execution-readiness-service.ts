import {
  InventoryExecutionIdentifiers,
  InventoryExecutionReadinessSnapshot,
  InventoryGateway,
  InventoryGatewayError,
  InventoryItemState,
  InventoryLevelState,
  ShoplineInventoryGateway,
} from '../../integration/shopline/inventory-gateway';
import { getRuntimeConfig } from '../../lib/config';
import type { ShopAdminAccessTokenProvider } from '../../lib/shop-admin-access-token';
import { Logger, logger } from '../../lib/logger';
import {
  BlindBoxPoolItemRepository,
  getBlindBoxPoolItemRepository,
} from '../../repository/blind-box-pool-item-repository';
import { BlindBoxPoolItem } from '../../domain/blind-box/types';
import { NotFoundError } from '../../lib/errors';
import {
  getInventoryOperationRepository,
  InventoryOperationRepository,
} from '../../repository/inventory-operation-repository';

export const REQUIRED_EXECUTE_MODE_SCOPES = [
  'read_products',
  'read_inventory',
  'read_location',
  'write_inventory',
] as const;

export type RequiredExecuteModeScope = (typeof REQUIRED_EXECUTE_MODE_SCOPES)[number];

export interface InventoryExecutionReadinessIssue {
  code: string;
  message: string;
  fixRecommendation: string;
}

export interface InventoryExecutionReadinessReport {
  status: 'ready' | 'not_ready';
  runtimeExecutionMode: 'deferred' | 'execute';
  configuredScopes: string[];
  requiredScopes: RequiredExecuteModeScope[];
  missingScopes: RequiredExecuteModeScope[];
  configuredLocationId: string | null;
  poolItemId: string;
  poolItemLabel: string;
  identifiers: InventoryExecutionIdentifiers | null;
  inventoryItem: InventoryItemState | null;
  inventoryLevel: InventoryLevelState | null;
  issues: InventoryExecutionReadinessIssue[];
  summary: string;
}

export interface InventoryExecutionReadinessServiceDependencies {
  poolItemRepository: BlindBoxPoolItemRepository;
  inventoryOperationRepository: InventoryOperationRepository;
  inventoryGateway: InventoryGateway;
  accessTokenProvider: ShopAdminAccessTokenProvider;
  logger: Logger;
}

function createMissingScopesIssue(
  missingScopes: RequiredExecuteModeScope[],
  configuredScopes: string[],
): InventoryExecutionReadinessIssue {
  return {
    code: 'SHOPLINE_CONFIGURED_SCOPES_MISSING',
    message: `Configured SHOPLINE scopes are missing execute-mode requirements: ${missingScopes.join(', ')}`,
    fixRecommendation:
      configuredScopes.length > 0
        ? `Update the private-app scopes, reinstall or reauthorize the app, and confirm SCOPES includes: ${REQUIRED_EXECUTE_MODE_SCOPES.join(', ')}`
        : `Set SCOPES to include: ${REQUIRED_EXECUTE_MODE_SCOPES.join(', ')}`,
  };
}

function createAccessTokenIssue(message: string): InventoryExecutionReadinessIssue {
  return {
    code: 'SHOPLINE_ACCESS_TOKEN_MISSING',
    message,
    fixRecommendation:
      'Open the embedded admin app for this store again so a usable admin session token is stored, then rerun validation or retry execution.',
  };
}

function createGatewayIssue(error: InventoryGatewayError): InventoryExecutionReadinessIssue {
  const fixRecommendationByCode: Record<string, string> = {
    SHOPLINE_SOURCE_PRODUCT_MISSING:
      'Populate sourceProductId or sourceVariantId on the blind-box pool item before enabling execute mode.',
    SHOPLINE_VARIANT_REQUIRED:
      'Set sourceVariantId on the blind-box pool item because the source product has multiple variants.',
    SHOPLINE_VARIANT_INVENTORY_ITEM_MISSING:
      'Verify the mapped source variant is inventory-backed in SHOPLINE and still exposes an inventory item.',
    SHOPLINE_PRODUCT_VARIANT_MISSING:
      'Verify the mapped source product still exists and still has a variant that can be used for inventory execution.',
    SHOPLINE_LOCATION_UNRESOLVED:
      'Set BLIND_BOX_SHOPLINE_LOCATION_ID or ensure the store has exactly one active/default location with read_location scope enabled.',
    SHOPLINE_LOCATION_CONFIGURED_NOT_FOUND:
      'Update BLIND_BOX_SHOPLINE_LOCATION_ID so it points to an active location in the connected store.',
    SHOPLINE_INVENTORY_NOT_TRACKED:
      'Enable inventory tracking for the mapped SHOPLINE item before using execute mode.',
    SHOPLINE_INVENTORY_LEVEL_MISSING:
      'Connect the inventory item to the target location and confirm SHOPLINE reports inventory for that location.',
    SHOPLINE_INVENTORY_HTTP_ERROR:
      'Check the private-app scopes, store permissions, and API response details before retrying.',
    SHOPLINE_INVENTORY_NETWORK_ERROR:
      'Re-run validation after connectivity stabilizes. Do not assume the external inventory state changed.',
  };

  return {
    code: error.code,
    message: error.message,
    fixRecommendation:
      fixRecommendationByCode[error.code] ||
      'Review the SHOPLINE store configuration and the recorded gateway error details before retrying.',
  };
}

function buildNotReadyReport(
  poolItem: BlindBoxPoolItem,
  issues: InventoryExecutionReadinessIssue[],
  configuredScopes: string[],
): InventoryExecutionReadinessReport {
  const runtimeConfig = getRuntimeConfig();
  const missingScopes = REQUIRED_EXECUTE_MODE_SCOPES.filter(
    (scope) => !configuredScopes.includes(scope),
  );

  return {
    status: 'not_ready',
    runtimeExecutionMode: runtimeConfig.blindBoxInventoryExecutionMode,
    configuredScopes,
    requiredScopes: [...REQUIRED_EXECUTE_MODE_SCOPES],
    missingScopes,
    configuredLocationId: runtimeConfig.blindBoxShoplineLocationId,
    poolItemId: poolItem.id,
    poolItemLabel: poolItem.label,
    identifiers: null,
    inventoryItem: null,
    inventoryLevel: null,
    issues,
    summary: issues[0]?.message || 'Inventory execute-mode readiness validation failed',
  };
}

function buildReadyReport(
  poolItem: BlindBoxPoolItem,
  configuredScopes: string[],
  snapshot: InventoryExecutionReadinessSnapshot,
): InventoryExecutionReadinessReport {
  const runtimeConfig = getRuntimeConfig();

  return {
    status: 'ready',
    runtimeExecutionMode: runtimeConfig.blindBoxInventoryExecutionMode,
    configuredScopes,
    requiredScopes: [...REQUIRED_EXECUTE_MODE_SCOPES],
    missingScopes: [],
    configuredLocationId: runtimeConfig.blindBoxShoplineLocationId,
    poolItemId: poolItem.id,
    poolItemLabel: poolItem.label,
    identifiers: snapshot.identifiers,
    inventoryItem: snapshot.inventoryItem,
    inventoryLevel: snapshot.inventoryLevel,
    issues: [],
    summary: `Pool item "${poolItem.label}" is ready for execute mode in the connected SHOPLINE store`,
  };
}

export class InventoryExecutionReadinessService {
  constructor(private readonly dependencies: InventoryExecutionReadinessServiceDependencies) {}

  async validatePoolItemExecutionReadiness(
    shop: string,
    poolItemId: string,
    options: {
      accessToken?: string;
    } = {},
  ): Promise<InventoryExecutionReadinessReport> {
    const poolItem = await this.dependencies.poolItemRepository.findById(shop, poolItemId);
    if (!poolItem) {
      throw new NotFoundError('Blind-box pool item not found for execute-mode validation');
    }

    return this.validatePoolItem(shop, poolItem, options);
  }

  async validateInventoryOperationExecutionReadiness(
    shop: string,
    operationId: string,
    options: {
      accessToken?: string;
    } = {},
  ): Promise<InventoryExecutionReadinessReport> {
    const operation = await this.dependencies.inventoryOperationRepository.findById(shop, operationId);
    if (!operation?.poolItemId) {
      throw new NotFoundError('Inventory operation or pool item context not found for execute-mode validation');
    }

    const poolItem = await this.dependencies.poolItemRepository.findById(shop, operation.poolItemId);
    if (!poolItem) {
      throw new NotFoundError('Blind-box pool item not found for inventory operation validation');
    }

    return this.validatePoolItem(shop, poolItem, options);
  }

  private async validatePoolItem(
    shop: string,
    poolItem: BlindBoxPoolItem,
    options: {
      accessToken?: string;
    },
  ): Promise<InventoryExecutionReadinessReport> {
    const runtimeConfig = getRuntimeConfig();
    const configuredScopes = runtimeConfig.shoplineConfiguredScopes;
    const missingScopes = REQUIRED_EXECUTE_MODE_SCOPES.filter(
      (scope) => !configuredScopes.includes(scope),
    );

    if (missingScopes.length > 0) {
      return buildNotReadyReport(poolItem, [createMissingScopesIssue(missingScopes, configuredScopes)], configuredScopes);
    }

    let accessToken: string;
    try {
      accessToken = options.accessToken || (await this.dependencies.accessTokenProvider.getAccessToken(shop));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Missing SHOPLINE admin access token';
      return buildNotReadyReport(poolItem, [createAccessTokenIssue(message)], configuredScopes);
    }

    try {
      const snapshot = await this.dependencies.inventoryGateway.validateExecutionReadiness({
        shop,
        accessToken,
        poolItemId: poolItem.id,
        sourceProductId: poolItem.sourceProductId,
        sourceVariantId: poolItem.sourceVariantId,
        quantity: 1,
        reason: 'blind_box_execute_mode_validation',
        idempotencyKey: `validate:${shop}:${poolItem.id}`,
        preferredLocationId: runtimeConfig.blindBoxShoplineLocationId,
      });

      this.dependencies.logger.info('Validated inventory execute-mode readiness for blind-box pool item', {
        shop,
        poolItemId: poolItem.id,
        identifiers: snapshot.identifiers,
      });

      return buildReadyReport(poolItem, configuredScopes, snapshot);
    } catch (error) {
      if (error instanceof InventoryGatewayError) {
        return buildNotReadyReport(poolItem, [createGatewayIssue(error)], configuredScopes);
      }

      throw error;
    }
  }
}

export async function getInventoryExecutionReadinessService(): Promise<InventoryExecutionReadinessService> {
  const { ShoplineSessionAccessTokenProvider } = await import('../../lib/shop-admin-access-token');
  const poolItemRepository = await getBlindBoxPoolItemRepository();
  const inventoryOperationRepository = await getInventoryOperationRepository();

  return new InventoryExecutionReadinessService({
    poolItemRepository,
    inventoryOperationRepository,
    inventoryGateway: new ShoplineInventoryGateway(),
    accessTokenProvider: new ShoplineSessionAccessTokenProvider(),
    logger,
  });
}
