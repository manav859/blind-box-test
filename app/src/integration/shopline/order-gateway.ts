export interface OrderLookupRequest {
  shop: string;
  orderId: string;
}

export interface OrderGateway {
  getOrder(_request: OrderLookupRequest): Promise<unknown>;
}

export class UnimplementedOrderGateway implements OrderGateway {
  async getOrder(): Promise<unknown> {
    throw new Error('Order lookup flow is not implemented in Phase 1');
  }
}
