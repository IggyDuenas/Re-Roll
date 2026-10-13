/** Marketplace rules. All server-side; the UI receives computed values via props. */
const num = (v: string | undefined, d: number) => {
  const n = v === undefined || v === '' ? NaN : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

export const config = {
  /** Stripe mode: real escrow via Stripe Connect. Off => demo payments. */
  get stripeEnabled() { return !!process.env.STRIPE_SECRET_KEY; },
  /** Max asking price as a percent of face value (150 = 1.5x). */
  get maxMarkupPct() { return Math.max(num(process.env.MAX_MARKUP_PCT, 150), 100); },
  /** Platform cut, as a percent of the sale price, taken from the seller's payout. */
  get feePct() { return Math.min(num(process.env.PLATFORM_FEE_PCT, 10), 50); },
  /** Minutes a buyer has to pay after reserving a listing. */
  get reserveMinutes() { return num(process.env.RESERVE_MINUTES, 15) || 15; },
  /** Hours after the event starts before delivered orders auto-release to the seller. */
  releaseAfterHours: 24,
};
