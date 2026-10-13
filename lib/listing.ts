import { config } from './config';
import type { PublicListing } from './types';

/** A listing can be bought only while active, and (in Stripe mode) once the seller can actually be paid out. */
export const isBuyable = (l: Pick<PublicListing, 'status' | 'payouts_ready'>) =>
  l.status === 'active' && (!config.stripeEnabled || l.payouts_ready);
