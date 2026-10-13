import { config } from './config';
import { stripe } from './stripe';
import type { EventRow, OrderRow } from './types';

/**
 * Escrow payments boundary.
 *
 * demo   (no STRIPE_SECRET_KEY): nothing moves; payment is "captured" instantly.
 * stripe (STRIPE_SECRET_KEY):    Stripe Connect, separate charges and transfers.
 *   hold    buyer pays via Checkout; the charge is captured into the PLATFORM balance (escrow). We capture
 *           immediately because card authorizations expire after ~7 days and events are further out.
 *   release a Transfer of payout_cents to the seller's connected account (linked to the original charge via
 *           source_transaction). fee_cents simply stays in the platform balance: that's Re-Roll's cut.
 *   refund  a Refund on the PaymentIntent returns the buyer's money. (Stripe doesn't return its processing fee.)
 * All money-moving calls carry idempotency keys derived from the order id, so retries can't pay twice.
 */
export type StartPayment =
  | { kind: 'captured'; paymentRef: string | null } // demo: already paid
  | { kind: 'redirect'; url: string };              // stripe: send the buyer to Checkout; the webhook completes the sale

export interface PaymentProvider {
  readonly name: 'demo' | 'stripe';
  readonly isDemo: boolean;
  startPayment(order: OrderRow, event: EventRow, urls: { success: string; cancel: string }): Promise<StartPayment>;
  /** Pay the seller. Returns the Transfer id (null in demo). Throws if it can't (the settlement retry picks it up). */
  release(order: OrderRow, sellerAccountId: string | null): Promise<string | null>;
  /** Refund the buyer for a paid order. Returns the Refund id (null in demo). */
  refund(order: OrderRow): Promise<string | null>;
  /** Refund a raw payment (duplicate / late / mismatched payments that never became an escrowed order). */
  refundPayment(paymentRef: string, idempotencyKey: string, reason: string): Promise<string | null>;
  /** Stripe only: create (or resume) the seller's Express account and return an onboarding URL. */
  onboardSeller(existingAccountId: string | null, urls: { return: string; refresh: string }, meta: Record<string, string>): Promise<{ accountId: string; url: string }>;
  /** Stripe only: can this connected account receive payouts yet? */
  payoutsReady(accountId: string): Promise<boolean>;
}

const log = (what: string, o: OrderRow) =>
  console.log(`[re·roll payments:demo] ${what} order ${o.id}: price ${o.price_cents}c, fee ${o.fee_cents}c, payout ${o.payout_cents}c`);

const demo: PaymentProvider = {
  name: 'demo',
  isDemo: true,
  async startPayment(order) { log('HOLD (simulated)', order); return { kind: 'captured', paymentRef: null }; },
  async release(o) { log('RELEASE to seller (simulated)', o); return null; },
  async refund(o) { log('REFUND to buyer (simulated)', o); return null; },
  async refundPayment(ref) { console.log(`[re·roll payments:demo] REFUND ${ref} (simulated)`); return null; },
  async onboardSeller() { throw new Error('Payout onboarding only exists in Stripe mode'); },
  async payoutsReady() { return true; },
};

const isAlreadyRefunded = (e: any) => e?.code === 'charge_already_refunded';

const live: PaymentProvider = {
  name: 'stripe',
  isDemo: false,

  async startPayment(order, event, urls) {
    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: { currency: 'usd', unit_amount: order.price_cents, product_data: { name: `${event.title}: resale ticket` } },
      }],
      client_reference_id: order.id,
      metadata: { order_id: order.id },
      payment_intent_data: { transfer_group: order.id, metadata: { order_id: order.id } },
      success_url: urls.success,
      cancel_url: urls.cancel,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // Stripe's minimum session lifetime
    });
    if (!session.url) throw new Error('Stripe did not return a Checkout URL');
    return { kind: 'redirect', url: session.url };
  },

  async release(order, sellerAccountId) {
    if (!order.payment_ref) throw new Error(`order ${order.id} has no payment_ref`);
    if (!sellerAccountId) throw new Error(`order ${order.id}: seller has no connected account`);
    const pi = await stripe().paymentIntents.retrieve(order.payment_ref);
    const charge = typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id;
    const transfer = await stripe().transfers.create(
      {
        amount: order.payout_cents,
        currency: 'usd',
        destination: sellerAccountId,
        transfer_group: order.id,
        ...(charge ? { source_transaction: charge } : {}),
        metadata: { order_id: order.id },
      },
      { idempotencyKey: `release_${order.id}` },
    );
    return transfer.id;
  },

  async refund(order) {
    if (!order.payment_ref) throw new Error(`order ${order.id} has no payment_ref`);
    return this.refundPayment(order.payment_ref, `refund_${order.id}`, 'requested_by_customer');
  },

  async refundPayment(paymentRef, idempotencyKey, reason) {
    try {
      const refund = await stripe().refunds.create({ payment_intent: paymentRef, metadata: { reason } }, { idempotencyKey });
      return refund.id;
    } catch (e) {
      if (isAlreadyRefunded(e)) return `already_refunded:${paymentRef}`;
      throw e;
    }
  },

  async onboardSeller(existingAccountId, urls, meta) {
    const accountId = existingAccountId ?? (await stripe().accounts.create({
      type: 'express',
      country: 'US',
      business_type: 'individual',
      capabilities: { transfers: { requested: true } },
      metadata: meta,
    })).id;
    const link = await stripe().accountLinks.create({ account: accountId, type: 'account_onboarding', return_url: urls.return, refresh_url: urls.refresh });
    return { accountId, url: link.url };
  },

  async payoutsReady(accountId) {
    const a = await stripe().accounts.retrieve(accountId);
    return !!(a.details_submitted && a.payouts_enabled);
  },
};

/** Resolved per call so tests/deploys can flip modes via env. */
export const payments: PaymentProvider = new Proxy({} as PaymentProvider, {
  get: (_t, prop) => {
    const p = config.stripeEnabled ? live : demo;
    const v = (p as any)[prop];
    return typeof v === 'function' ? v.bind(p) : v;
  },
});
