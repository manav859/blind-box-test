import { validateCreateBlindBoxInput } from '../../domain/blind-box/validation';
import { BlindBox, CreateBlindBoxInput } from '../../domain/blind-box/types';
import { BlindBoxRepository, getBlindBoxRepository } from '../../repository/blind-box-repository';

export class BlindBoxService {
  constructor(private readonly blindBoxRepository: BlindBoxRepository) {}

  async createBlindBox(shop: string, input: CreateBlindBoxInput): Promise<BlindBox> {
    const normalizedInput = validateCreateBlindBoxInput(input);
    return this.blindBoxRepository.create(shop, normalizedInput);
  }

  async listBlindBoxes(shop: string): Promise<BlindBox[]> {
    return this.blindBoxRepository.listByShop(shop);
  }

  async getBlindBox(shop: string, blindBoxId: string): Promise<BlindBox | null> {
    return this.blindBoxRepository.findById(shop, blindBoxId);
  }
}

export async function getBlindBoxService(): Promise<BlindBoxService> {
  const repository = await getBlindBoxRepository();
  return new BlindBoxService(repository);
}
