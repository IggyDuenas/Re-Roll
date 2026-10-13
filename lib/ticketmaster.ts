import type { EventRow } from './types';

const API = 'https://app.ticketmaster.com/discovery/v2/events.json';

interface TmImage { url: string; width: number; height: number; ratio?: string }
interface TmEvent {
  id: string; name: string; url?: string; info?: string; pleaseNote?: string;
  images?: TmImage[];
  dates?: { start?: { dateTime?: string }; status?: { code?: string } };
  priceRanges?: { min?: number }[];
  classifications?: { segment?: { name?: string }; genre?: { name?: string }; subGenre?: { name?: string } }[];
  _embedded?: { venues?: { name?: string; city?: { name?: string }; state?: { stateCode?: string } }[]; attractions?: { name?: string }[] };
}

export const tmConfigured = () => !!process.env.TICKETMASTER_API_KEY;

/** Best landscape image at a reasonable size; fall back to anything we have. */
function pickImage(images: TmImage[] = []) {
  const ok = images.filter((i) => i.width >= 640).sort((a, b) => a.width - b.width);
  return (ok.find((i) => i.ratio === '16_9') ?? ok[0] ?? images[0])?.url ?? null;
}

export function mapEvent(t: TmEvent): EventRow | null {
  const starts = t.dates?.start?.dateTime;
  const code = t.dates?.status?.code;
  const v = t._embedded?.venues?.[0];
  if (!starts || !v?.name || code === 'cancelled' || code === 'postponed') return null;
  const cls = t.classifications?.[0];
  const sub = cls?.subGenre?.name;
  const genre = (cls?.genre?.name === 'Dance/Electronic' && sub && sub !== 'Undefined' ? sub : [cls?.genre?.name, cls?.segment?.name].find((g) => g && g !== 'Undefined')) ?? 'Live';
  const min = t.priceRanges?.[0]?.min;
  const city = v.city?.name ?? '';
  return {
    id: `tm-${t.id}`,
    external_id: t.id,
    title: t.name,
    artist: t._embedded?.attractions?.[0]?.name ?? t.name,
    venue: v.name,
    city: v.state?.stateCode && city ? `${city}, ${v.state.stateCode}` : city,
    starts_at: new Date(starts).toISOString(),
    price_cents: typeof min === 'number' && min > 0 ? Math.round(min * 100) : 0,
    description: (t.info || t.pleaseNote || '').slice(0, 600),
    genre,
    image_url: pickImage(t.images),
    source_url: t.url ?? null,
  };
}

const DANCE_GENRE_ID = 'KnvZfZ7vAvF'; // Ticketmaster "Dance/Electronic"
const csv = (v: string | undefined, fallback: string[]) => (v === undefined ? fallback : v.split(',').map((x) => x.trim()).filter(Boolean));

/** Artists and venues that are always wanted, even when Ticketmaster files them under another genre. */
export const DEFAULT_ARTISTS = ['Prospa', 'Antor', 'III Points', 'Circo Loco', 'Fisher'];
export const DEFAULT_VENUES = ['Club Space'];

const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const hasWord = (haystack: string, needle: string) => ` ${norm(haystack)} `.includes(` ${norm(needle)} `);

/** House/EDM only: Dance/Electronic genre, or a named artist, or a named venue. */
export function isWanted(t: TmEvent, artists: string[], venues: string[]): boolean {
  const cls = t.classifications?.[0];
  if (cls?.genre?.name === 'Dance/Electronic') return true;
  // Artists must be the billed act (or the festival name), not just a word in the event title or venue.
  const billed = t._embedded?.attractions?.map((a) => a.name ?? '') ?? [];
  const acts = (billed.length ? billed : [t.name]).map(norm);
  if (artists.some((a) => acts.some((n) => n === norm(a) || n.startsWith(`${norm(a)} `)))) return true;
  const venue = t._embedded?.venues?.[0]?.name ?? '';
  return venues.some((v) => hasWord(venue, v));
}

async function page(params: Record<string, string>) {
  const u = new URL(API);
  u.search = new URLSearchParams(params).toString();
  const res = await fetch(u, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Ticketmaster API returned ${res.status}.`);
  return (await res.json()) as { _embedded?: { events?: TmEvent[] }; page?: { totalPages?: number } };
}

/**
 * Pulls upcoming house/EDM events from the Ticketmaster Discovery API (free key from developer.ticketmaster.com).
 * - every Dance/Electronic event (optionally narrowed by TICKETMASTER_CITIES),
 * - plus searches for the wanted artists (TICKETMASTER_ARTISTS) and venues (TICKETMASTER_VENUES),
 * and then keeps only events that pass isWanted().
 */
export async function fetchTicketmasterEvents(): Promise<EventRow[]> {
  const key = process.env.TICKETMASTER_API_KEY;
  if (!key) throw new Error('TICKETMASTER_API_KEY is not set.');
  const cities = csv(process.env.TICKETMASTER_CITIES, []);
  const artists = csv(process.env.TICKETMASTER_ARTISTS, DEFAULT_ARTISTS);
  const venues = csv(process.env.TICKETMASTER_VENUES, DEFAULT_VENUES);
  const base = { apikey: key, countryCode: 'US', size: '100', sort: 'date,asc', startDateTime: new Date().toISOString().replace(/\.\d+Z$/, 'Z') };

  const jobs: Record<string, string>[] = [
    ...(cities.length ? cities : ['']).map((city) => ({ ...base, genreId: DANCE_GENRE_ID, ...(city ? { city } : {}) })),
    ...[...artists, ...venues].map((keyword) => ({ ...base, keyword, classificationName: 'music' })),
  ];
  const out = new Map<string, EventRow>();
  for (const job of jobs) {
    for (let p = 0; p < 3; p++) {
      const body = await page({ ...job, page: String(p) });
      for (const t of body._embedded?.events ?? []) {
        if (!isWanted(t, artists, venues)) continue;
        const e = mapEvent(t);
        if (e) out.set(e.id, e);
      }
      if (p + 1 >= (body.page?.totalPages ?? 1)) break;
    }
  }
  return [...out.values()];
}
