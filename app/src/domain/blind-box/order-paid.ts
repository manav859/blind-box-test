export interface OrderPaidLineItem {
  id: string;
  product_id: string;
  variant_id?: string | null;
  quantity?: number;
  title?: string;
  variant_title?: string | null;
  sku?: string | null;
}

export interface OrderPaidCustomer {
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  email?: string | null;
}

export interface OrderPaidWebhookPayload {
  id: string;
  name?: string;
  order_seq?: string;
  email?: string | null;
  customer?: OrderPaidCustomer | null;
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

export interface OrderContext {
  /** Human-facing order number/name (e.g. "#1001"), falling back to the order id. */
  orderName: string;
  customerName: string | null;
  customerEmail: string | null;
}

/**
 * Extract merchant-facing order display fields from the paid-order payload so the
 * Assignments page can show "ship reward X to customer Y for order #Z". Customer
 * fields are best-effort — SHOPLINE payloads vary, so anything missing is null and
 * the merchant can still open the order by its number to get the shipping address.
 */
export function getOrderContext(payload: OrderPaidWebhookPayload): OrderContext {
  const orderName = (payload.name || payload.order_seq || payload.id || '').toString().trim() || payload.id;

  const customer = payload.customer ?? null;
  const composedName = [customer?.first_name, customer?.last_name]
    .map((part) => (part ?? '').toString().trim())
    .filter(Boolean)
    .join(' ');
  const customerName = (customer?.name?.toString().trim() || composedName) || null;
  const customerEmail = (customer?.email ?? payload.email ?? null)?.toString().trim() || null;

  return { orderName, customerName, customerEmail };
}
