import { errorResponse, json, readJson, text } from '@/lib/api';
import { payments } from '@/lib/payments';
import { settleOrder } from '@/lib/settlement';
import { baseUrl, sendSms } from '@/lib/sms';
import { getStore } from '@/lib/store';
import { notifySellerPaid } from '@/lib/notify';
import { isTokenShaped } from '@/lib/tokens';
import { StoreError } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Buyer actions: pay (into escrow), confirm (release to seller), dispute. */
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const body = await readJson(req);
  const action = body?.action;
  if (action !== 'pay' && action !== 'confirm' && action !== 'dispute') return json({ error: "action must be 'pay', 'confirm' or 'dispute'." }, 400);
  if (!isTokenShaped(params.token)) return json({ error: 'Order not found.', code: 'order_not_found' }, 404);

  try {
    const store = getStore();
    const view = await store.getOrderView(params.token);
    if (!view) throw new StoreError('order_not_found');

    if (action === 'pay') {
      if (view.order.status !== 'pending_payment') throw new StoreError('invalid_state');
      const base = baseUrl(req);
      const start = await payments.startPayment(view.order, view.event, {
        success: `${base}/o/${params.token}?paid=1`,
        cancel: `${base}/o/${params.token}`,
      });
      if (start.kind === 'redirect') return json({ ok: true, redirect: start.url }); // the Stripe webhook completes the sale
      const order = await store.markPaidById(view.order.id, start.paymentRef);
      await notifySellerPaid(store, order, view.event.title, base);
      return json({ ok: true, status: order.status });
    }

    if (action === 'confirm') {
      const order = await store.confirmReceived(params.token);
      await settleOrder(store, order);
      void sendSms(view.sellerPhone, `re·roll: the buyer confirmed your ticket for ${view.event.title}. $${(order.payout_cents / 100).toFixed(2)} is being paid out to you.`);
      return json({ ok: true, status: order.status });
    }

    const reason = text(body?.reason, 500);
    if (reason.length < 4) return json({ error: 'Tell us what went wrong (a few words is fine).' }, 400);
    const order = await store.openDispute(params.token, reason);
    console.log(`[re·roll dispute] order ${order.id}: ${reason}`);
    return json({ ok: true, status: order.status });
  } catch (err) {
    return errorResponse(err);
  }
}
