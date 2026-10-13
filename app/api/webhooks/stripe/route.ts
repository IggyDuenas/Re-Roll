import type Stripe from 'stripe';
import { json } from '@/lib/api';
import { notifySellerPaid } from '@/lib/notify';
import { payments } from '@/lib/payments';
import { baseUrl } from '@/lib/sms';
import { getStore } from '@/lib/store';
import { stripe } from '@/lib/stripe';
import { StoreError } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Stripe webhooks. Configure the endpoint for: checkout.session.completed, account.updated.
 * The signature is verified against the RAW body with STRIPE_WEBHOOK_SECRET. Handlers are idempotent
 * (Stripe retries), and a payment that can't become an escrowed order is refunded, never kept.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!process.env.STRIPE_SECRET_KEY || !secret) return json({ error: 'Stripe webhooks are not configured.' }, 503);

  const raw = await req.text();
  const sig = req.headers.get('stripe-signature');
  if (!sig) return json({ error: 'Missing signature.' }, 400);
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig, secret);
  } catch {
    return json({ error: 'Invalid signature.' }, 400);
  }

  try {
    if (event.type === 'checkout.session.completed') await onCheckoutCompleted(event.data.object as Stripe.Checkout.Session, baseUrl(req));
    else if (event.type === 'account.updated') {
      const a = event.data.object as Stripe.Account;
      await getStore().setPayoutsReady(a.id, !!(a.details_submitted && a.payouts_enabled));
    }
    return json({ received: true });
  } catch (err) {
    console.error(`[re·roll stripe webhook] ${event.type} ${event.id} failed`, err);
    return json({ error: 'Handler failed; Stripe will retry.' }, 500); // non-2xx => Stripe retries with backoff
  }
}

async function onCheckoutCompleted(s: Stripe.Checkout.Session, base: string) {
  if (s.payment_status !== 'paid') return; // card payments are 'paid' on completion
  const pi = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id;
  if (!pi) throw new Error(`session ${s.id} completed without a payment_intent`);
  const store = getStore();
  const orderId = s.metadata?.order_id;
  const order = orderId ? await store.getOrderById(orderId) : null;

  if (!order) {
    console.error(`[re·roll stripe webhook] payment ${pi} for unknown order ${orderId}; refunding`);
    await payments.refundPayment(pi, `refund_orphan_${pi}`, 'unknown_order');
    return;
  }
  if (s.amount_total !== order.price_cents || s.currency !== 'usd') {
    console.error(`[re·roll stripe webhook] amount mismatch on order ${order.id} (${s.amount_total} ${s.currency} vs ${order.price_cents}); refunding`);
    await payments.refundPayment(pi, `refund_mismatch_${pi}`, 'amount_mismatch');
    return;
  }
  try {
    const paid = await store.markPaidById(order.id, pi);
    if (paid.payment_ref === pi && order.status === 'pending_payment') {
      const view = await store.getOrderById(order.id);
      const ev = view ? await store.getEvent(view.event_id) : null;
      await notifySellerPaid(store, paid, ev?.title ?? 'your event', base);
    }
  } catch (err) {
    if (!(err instanceof StoreError)) throw err;
    // The reservation lapsed, the order is already paid by a different payment, or it was cancelled: give the money back.
    console.error(`[re·roll stripe webhook] order ${order.id} can't accept payment ${pi} (${err.code}); refunding`);
    await payments.refundPayment(pi, `refund_late_${pi}`, 'order_not_payable');
  }
}
