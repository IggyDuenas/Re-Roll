import { sendSms } from './sms';
import type { OrderRow, Store } from './types';

/** Tell the seller their ticket sold and payment is in escrow. */
export async function notifySellerPaid(store: Store, order: OrderRow, eventTitle: string, base: string) {
  const seller = await store.getSellerContact(order.listing_id);
  if (!seller) return;
  await sendSms(seller.phone, `re·roll: your ticket for ${eventTitle} sold for $${(order.price_cents / 100).toFixed(2)}. Payment is held in escrow. Deliver the ticket now: ${base}/s/${seller.token}`);
}
