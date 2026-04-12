export interface OrderPaidLineItem {
  id: string;
  product_id: string;
  variant_id?: string | null;
  quantity?: number;
  title?: string;
  variant_title?: string | null;
  sku?: string | null;
}

export interface OrderPaidWebhookPayload {
  id: string;
  name?: string;
  order_seq?: string;
  line_items?: OrderPaidLineItem[];
  payment_details?: Array<{
    pay_status?: string;
    pay_amount?: number | string;
  }>;
  created_at?: string;
}

export function getOrderLineItems(payload: OrderPaidWebhookPayload): OrderPaidLineItem[] {
  return Array.isArray(payload.line_items) ? payload.line_items : [];
}
