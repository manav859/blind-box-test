import { BlindBoxProductMapping, UpsertBlindBoxProductMappingInput } from '../../domain/blind-box/types';
import { validateUpsertBlindBoxProductMappingInput } from '../../domain/blind-box/validation';
import {
  BlindBoxProductMappingRepository,
  getBlindBoxProductMappingRepository,
} from '../../repository/blind-box-product-mapping-repository';

export class BlindBoxProductMappingService {
  constructor(private readonly productMappingRepository: BlindBoxProductMappingRepository) {}

  async upsertProductMapping(
    shop: string,
    input: UpsertBlindBoxProductMappingInput,
  ): Promise<BlindBoxProductMapping> {
    const normalizedInput = validateUpsertBlindBoxProductMappingInput(input);
    return this.productMappingRepository.upsert(shop, normalizedInput);
  }

  async listProductMappings(shop: string): Promise<BlindBoxProductMapping[]> {
    return this.productMappingRepository.listByShop(shop);
  }
}

export async function getBlindBoxProductMappingService(): Promise<BlindBoxProductMappingService> {
  const repository = await getBlindBoxProductMappingRepository();
  return new BlindBoxProductMappingService(repository);
}
