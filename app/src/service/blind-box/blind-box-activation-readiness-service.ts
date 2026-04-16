import { evaluateEligiblePoolItems } from '../../domain/blind-box/selection';
import { ValidationError } from '../../lib/errors';
import {
  BlindBoxPoolItemRepository,
  getBlindBoxPoolItemRepository,
} from '../../repository/blind-box-pool-item-repository';
import {
  BlindBoxProductMappingRepository,
  getBlindBoxProductMappingRepository,
} from '../../repository/blind-box-product-mapping-repository';
import {
  getInventoryExecutionReadinessService,
  InventoryExecutionReadinessService,
} from '../inventory/inventory-execution-readiness-service';
import { getRuntimeConfig } from '../../lib/config';

export interface BlindBoxActivationReadinessServiceDependencies {
  poolItemRepository: BlindBoxPoolItemRepository;
  productMappingRepository: BlindBoxProductMappingRepository;
  inventoryExecutionReadinessService: InventoryExecutionReadinessService;
}

export class BlindBoxActivationReadinessService {
  constructor(
    private readonly dependencies: BlindBoxActivationReadinessServiceDependencies,
  ) {}

  async assertReadyForActivation(
    shop: string,
    blindBoxId: string,
    options: {
      accessToken?: string;
    } = {},
  ): Promise<void> {
    const mappings = await this.dependencies.productMappingRepository.listByShop(shop);
    const enabledMappings = mappings.filter(
      (mapping) => mapping.blindBoxId === blindBoxId && mapping.enabled,
    );

    if (enabledMappings.length === 0) {
      throw new ValidationError(
        'Cannot activate this blind box until at least one enabled blind-box product mapping exists.',
      );
    }

    const poolItems = await this.dependencies.poolItemRepository.listByBlindBoxId(
      shop,
      blindBoxId,
    );
    if (poolItems.length === 0) {
      throw new ValidationError(
        'Cannot activate this blind box until at least one pool item exists.',
      );
    }

    const { eligibleItems } = evaluateEligiblePoolItems(poolItems);
    if (eligibleItems.length === 0) {
      throw new ValidationError(
        'Cannot activate this blind box until at least one enabled in-stock pool item exists.',
      );
    }

    const runtimeConfig = getRuntimeConfig();
    if (runtimeConfig.blindBoxInventoryExecutionMode !== 'execute') {
      return;
    }

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
        return;
      }
    }

    throw new ValidationError(
      'Cannot activate this blind box until at least one eligible pool item passes execute-mode readiness validation.',
    );
  }
}

export async function getBlindBoxActivationReadinessService(): Promise<BlindBoxActivationReadinessService> {
  const poolItemRepository = await getBlindBoxPoolItemRepository();
  const productMappingRepository = await getBlindBoxProductMappingRepository();
  const inventoryExecutionReadinessService = await getInventoryExecutionReadinessService();

  return new BlindBoxActivationReadinessService({
    poolItemRepository,
    productMappingRepository,
    inventoryExecutionReadinessService,
  });
}
