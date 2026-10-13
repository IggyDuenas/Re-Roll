import { errorResponse, json, readJson, text } from '@/lib/api';
import { payments } from '@/lib/payments';
import { baseUrl, sendSms } from '@/lib/sms';
import { getStore } from '@/lib/store';
import { isTokenShaped } from '@/lib/tokens';
import { StoreError } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Seller actions: cancel an unsold listing, deliver the ticket, or refund the buyer. */
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const body = await readJson(req);
  const action = body?.action;
  if (action !== 'cancel' && action !== 'deliver' && action !== 'refund') return json({ error: "action must be 'cancel', 'deliver' or 'refund'." }, 400);
  if (!isTokenShaped(params.token)) return json({ error: 'Listing not found.', code: 'listing_not_found' }, 404);

  try {
    const store = getStore();
    if (action === 'cancel') {
      const l = await store.cancelListing(params.token);
      return json({ ok: true, status: l.status });
    }
    const view = await store.getSellerView(params.token);
    if (!view) throw new StoreError('listing_not_found');

    if (action === 'deliver') {
      const note = text(body?.note, 1000);
      if (note.length < 4) return json({ error: 'Describe how you delivered the ticket (e.g. what you sent the buyer and how).' }, 400);
      const order = await store.markDelivered(params.token, note);
      void sendSms(order.buyer_phone, `re·roll: the seller delivered your ticket for ${view.event.title}. Check it, then confirm or report a problem: ${baseUrl(req)}/o/${order.buyer_token}`);
      return json({ ok: true, status: order.status });
    }

    const order = await store.sellerRefund(params.token);
    await payments.refund(order);
    void sendSms(order.buyer_phone, `re·roll: the seller cancelled the sale of your ticket for ${view.event.title}. You've been refunded in full.`);
    return json({ ok: true, status: order.status });
  } catch (err) {
    return errorResponse(err);
  }
}
