import { config } from './config';

export const MIN_FACE_CENTS = 100;
export const MAX_FACE_CENTS = 200_000;

export const maxPriceFor = (faceCents: number) => Math.floor((faceCents * config.maxMarkupPct) / 100);
export const feeFor = (priceCents: number) => Math.round((priceCents * config.feePct) / 100);
export const payoutFor = (priceCents: number) => priceCents - feeFor(priceCents);

/** Returns an error message, or null when face value and asking price are acceptable. */
export function validatePricing(faceCents: number, priceCents: number): string | null {
  if (!Number.isInteger(faceCents) || faceCents < MIN_FACE_CENTS || faceCents > MAX_FACE_CENTS)
    return 'Enter the face value you paid, between $1 and $2,000.';
  if (!Number.isInteger(priceCents) || priceCents < MIN_FACE_CENTS) return 'Enter an asking price of at least $1.';
  const cap = maxPriceFor(faceCents);
  if (priceCents > cap) return `Asking price can be at most ${(cap / 100).toFixed(2)} (${config.maxMarkupPct}% of face value).`;
  return null;
}

/** "2 ≈ +20%" style label. */
export const markupPct = (faceCents: number, priceCents: number) => Math.round(((priceCents - faceCents) / faceCents) * 100);
