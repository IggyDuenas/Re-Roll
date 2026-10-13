import { payments } from './payments';
import type { OrderRow, Store } from './types';

/**
 * Move the money for an order that has reached released/refunded, and record the Transfer/Refund id.
 * Never throws: if the payment provider fails the order stays in the pending-settlement queue
 * (released/refunded, paid through Stripe, no settlement_ref) and /api/cron/settle retries it.
 * Safe to retry: the provider uses idempotency keys derived from the order id.
 */
export async function settleOrder(store: Store, order: OrderRow): Promise<void> {
  try {
    let ref: string | null;
    if (order.status === 'released') {
      const seller = await store.getSellerContact(order.listing_id);
      ref = await payments.release(order, seller?.stripeAccountId ?? null);
    } else if (order.status === 'refunded') {
      ref = await payments.refund(order);
    } else return;
    if (ref) await store.setSettlementRef(order.id, ref);
  } catch (err) {
    console.error(`[re·roll settlement] order ${order.id} (${order.status}) failed; will retry on the next settle run`, err);
  }
}
