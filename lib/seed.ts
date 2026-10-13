import { config } from './config';
import { newId, newToken } from './tokens';
import type { EventRow, ListingRow } from './types';

const day = 24 * 60 * 60 * 1000;
const at = (days: number, hour: number) => {
  const d = new Date(Date.now() + days * day);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

export function seedEvents(): EventRow[] {
  return [
    { id: 'neon-tides-warehouse', title: 'Neon Tides', artist: 'Neon Tides', venue: 'Pier 9 Warehouse', city: 'Brooklyn', starts_at: at(9, 1), price_cents: 3500, genre: 'Electronic', description: 'Seven hours of synth-heavy dance floor in a converted shipping warehouse. Two rooms, one lineup built around live hardware sets.' },
    { id: 'marlow-june-hall', title: 'Marlow June: Quiet Hours Tour', artist: 'Marlow June', venue: 'The Gilded Hall', city: 'Chicago', starts_at: at(16, 0), price_cents: 4800, genre: 'Indie Folk', description: 'An intimate, seated evening of hushed songwriting. Doors at 7, no phones on the floor during the set.' },
    { id: 'low-orbit-club', title: 'Low Orbit: Release Party', artist: 'Low Orbit', venue: 'Basement 44', city: 'Austin', starts_at: at(5, 2), price_cents: 1800, genre: 'Post-punk', description: 'Tiny room, loud amps. Low Orbit plays their new record front to back.' },
    { id: 'sol-y-sombra', title: 'Sol y Sombra Night', artist: 'Sol y Sombra', venue: 'Teatro Alba', city: 'Los Angeles', starts_at: at(23, 3), price_cents: 5500, genre: 'Latin', description: 'A full-band cumbia and bolero revival with guest vocalists and a late set from DJ Calle.' },
    { id: 'the-velvet-drive', title: 'The Velvet Drive', artist: 'The Velvet Drive', venue: 'Rustbelt Ballroom', city: 'Detroit', starts_at: at(12, 1), price_cents: 2800, genre: 'Rock', description: 'Garage-soul heavyweights return to the city that made them. Openers announced soon.' },
    { id: 'kaito-after-dark', title: 'Kaito: After Dark', artist: 'DJ Kaito', venue: 'Halcyon Rooftop', city: 'Miami', starts_at: at(30, 3), price_cents: 6500, genre: 'House', description: 'Sunset-to-sunrise house session over the bay. Dress for warm air and a long night.' },
  ];
}

/** Demo listings so the marketplace isn't empty on first run (fake sellers, fake proof). */
export function seedListings(): ListingRow[] {
  if (config.stripeEnabled) return []; // fake sellers can't be paid out
  const mk = (event_id: string, name: string, face: number, price: number, n: number): ListingRow => ({
    id: newId(), event_id, seller_token: newToken(), seller_phone: `+1555010${1000 + n}`.slice(0, 12),
    seller_name: name, face_value_cents: face, price_cents: price, proof_note: 'Demo seed listing', stripe_account_id: null, payouts_ready: true,
    status: 'active', created_at: new Date(Date.now() - n * 3600_000).toISOString(),
  });
  return [
    mk('low-orbit-club', 'Sam', 1800, 2400, 1),
    mk('low-orbit-club', 'Priya', 1800, 1800, 2),
    mk('neon-tides-warehouse', 'Dre', 3500, 4800, 3),
    mk('sol-y-sombra', 'Lucía', 5500, 6500, 4),
  ];
}
