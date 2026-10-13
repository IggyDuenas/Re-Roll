import type { OrderRow } from './types';

/**
 * Escrow payments boundary. ONLY a demo provider exists: no money moves.
 * TODO(stripe): implement a Stripe adapter (Checkout with manual capture or Connect destination charges with
 * delayed payouts) behind this interface; capture on `hold`, `release` pays the seller payout_cents and keeps
 * fee_cents, `refund` returns the buyer's funds.
 */
export interface PaymentProvider {
  readonly name: 'demo';
  readonly isDemo: boolean;
  hold(order: OrderRow): Promise<void>;
  release(order: OrderRow): Promise<void>;
  refund(order: OrderRow): Promise<void>;
}

const log = (what: string, o: OrderRow) =>
  console.log(`[re·roll payments:demo] ${what} order ${o.id}: price ${o.price_cents}c, fee ${o.fee_cents}c, payout ${o.payout_cents}c`);

export const payments: PaymentProvider = {
  name: 'demo',
  isDemo: true,
  async hold(o) { log('HOLD (simulated)', o); },
  async release(o) { log('RELEASE to seller (simulated)', o); },
  async refund(o) { log('REFUND to buyer (simulated)', o); },
};
