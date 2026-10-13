import type { EventRow, TicketRow } from './types';
import { newToken } from './tokens';

const day = 24 * 60 * 60 * 1000;
const at = (days: number, hour: number) => {
  const d = new Date(Date.now() + days * day);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

export function seedEvents(): EventRow[] {
  return [
    { id: 'neon-tides-warehouse', title: 'Neon Tides', artist: 'Neon Tides', venue: 'Pier 9 Warehouse', city: 'Brooklyn', starts_at: at(9, 1), price_cents: 3500, capacity: 400, genre: 'Electronic', description: 'Seven hours of synth-heavy dance floor in a converted shipping warehouse. Two rooms, one lineup built around live hardware sets.' },
    { id: 'marlow-june-hall', title: 'Marlow June: Quiet Hours Tour', artist: 'Marlow June', venue: 'The Gilded Hall', city: 'Chicago', starts_at: at(16, 0), price_cents: 4800, capacity: 220, genre: 'Indie Folk', description: 'An intimate, seated evening of hushed songwriting. Doors at 7, no phones on the floor during the set.' },
    { id: 'low-orbit-club', title: 'Low Orbit: Release Party', artist: 'Low Orbit', venue: 'Basement 44', city: 'Austin', starts_at: at(5, 2), price_cents: 1800, capacity: 6, genre: 'Post-punk', description: 'Tiny room, loud amps. Low Orbit plays their new record front to back. Only a handful of spots, so grab one fast.' },
    { id: 'sol-y-sombra', title: 'Sol y Sombra Night', artist: 'Sol y Sombra', venue: 'Teatro Alba', city: 'Los Angeles', starts_at: at(23, 3), price_cents: 5500, capacity: 600, genre: 'Latin', description: 'A full-band cumbia and bolero revival with guest vocalists and a late set from DJ Calle.' },
    { id: 'the-velvet-drive', title: 'The Velvet Drive', artist: 'The Velvet Drive', venue: 'Rustbelt Ballroom', city: 'Detroit', starts_at: at(12, 1), price_cents: 2800, capacity: 350, genre: 'Rock', description: 'Garage-soul heavyweights return to the city that made them. Openers announced soon.' },
    { id: 'kaito-after-dark', title: 'Kaito: After Dark', artist: 'DJ Kaito', venue: 'Halcyon Rooftop', city: 'Miami', starts_at: at(30, 3), price_cents: 6500, capacity: 300, genre: 'House', description: 'Sunset-to-sunrise house session over the bay. Dress for warm air and a long night.' },
  ];
}

/** A few pre-existing holders so the demo shows "N left" and a re-rolled badge out of the box. */
export function seedTickets(): TicketRow[] {
  const mk = (event_id: string, status: TicketRow['status'], n: number, ageMin: number): TicketRow => ({
    id: `seed-${event_id}-${n}`,
    event_id,
    token: newToken(),
    phone: `+1555010${String(1000 + n).slice(-4)}`,
    holder_name: null,
    status,
    created_at: new Date(Date.now() - ageMin * 60000).toISOString(),
  });
  const tickets: TicketRow[] = [];
  // Low Orbit (cap 6): 4 sold, 1 re-rolled -> 2 left, with the re-roll badge
  for (let i = 0; i < 4; i++) tickets.push(mk('low-orbit-club', 'valid', i, 600 - i));
  tickets.push(mk('low-orbit-club', 'listed', 9, 300));
  // Marlow June: a couple sold
  for (let i = 0; i < 3; i++) tickets.push(mk('marlow-june-hall', 'valid', 20 + i, 900 - i));
  return tickets;
}
