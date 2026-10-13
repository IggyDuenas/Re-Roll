import { errorResponse, hasBearer, json } from '@/lib/api';
import { seedEvents } from '@/lib/seed';
import { getStore } from '@/lib/store';
import { fetchTicketmasterEvents, tmConfigured } from '@/lib/ticketmaster';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Imports real upcoming events from Ticketmaster. Run daily. Authorization: Bearer $CRON_SECRET.
 * After a successful import the built-in demo events are removed (unless someone already listed a ticket on one).
 */
export async function POST(req: Request) {
  if (!hasBearer(req, process.env.CRON_SECRET)) return json({ error: 'Unauthorized.' }, 401);
  if (!tmConfigured()) return json({ error: 'TICKETMASTER_API_KEY is not set.' }, 400);
  try {
    const events = await fetchTicketmasterEvents();
    if (events.length === 0) return json({ ok: true, imported: 0, note: 'Feed returned no events; demo events kept.' });
    const store = getStore();
    const imported = await store.upsertEvents(events);
    const removedDemo = await store.deleteEventsWithoutListings(seedEvents().map((e) => e.id));
    return json({ ok: true, imported, removedDemo });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Vercel Cron issues GET requests (with the same bearer header). */
export const GET = POST;
