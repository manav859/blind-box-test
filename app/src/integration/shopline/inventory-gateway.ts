export interface InventoryAdjustmentRequest {
  shop: string;
  poolItemId: string;
  quantity: number;
  reason: string;
  idempotencyKey: string;
}

export interface InventoryGateway {
  reserve(_request: InventoryAdjustmentRequest): Promise<void>;
  commit(_request: InventoryAdjustmentRequest): Promise<void>;
  release(_request: InventoryAdjustmentRequest): Promise<void>;
}

export class UnimplementedInventoryGateway implements InventoryGateway {
  async reserve(): Promise<void> {
    throw new Error('Inventory reserve flow is not implemented in Phase 1');
  }

  async commit(): Promise<void> {
    throw new Error('Inventory commit flow is not implemented in Phase 1');
  }

  async release(): Promise<void> {
    throw new Error('Inventory release flow is not implemented in Phase 1');
  }
}
