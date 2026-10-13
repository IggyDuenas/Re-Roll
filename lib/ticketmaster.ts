import type { EventRow } from './types';

const API = 'https://app.ticketmaster.com/discovery/v2/events.json';

interface TmImage { url: string; width: number; height: number; ratio?: string }
interface TmEvent {
  id: string; name: string; url?: string; info?: string; pleaseNote?: string;
  images?: TmImage[];
  dates?: { start?: { dateTime?: string }; status?: { code?: string } };
  priceRanges?: { min?: number }[];
  classifications?: { segment?: { name?: string }; genre?: { name?: string } }[];
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
  const genre = [cls?.genre?.name, cls?.segment?.name].find((g) => g && g !== 'Undefined') ?? 'Live';
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

/**
 * Pulls upcoming music events from the Ticketmaster Discovery API (free key from developer.ticketmaster.com).
 * TICKETMASTER_CITIES (comma list, optional) narrows the feed; otherwise the most popular US events are used.
 */
export async function fetchTicketmasterEvents(): Promise<EventRow[]> {
  const key = process.env.TICKETMASTER_API_KEY;
  if (!key) throw new Error('TICKETMASTER_API_KEY is not set.');
  const cities = (process.env.TICKETMASTER_CITIES ?? '').split(',').map((c) => c.trim()).filter(Boolean);
  const start = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const queries = cities.length ? cities : [''];
  const out = new Map<string, EventRow>();
  for (const city of queries) {
    for (let page = 0; page < 3; page++) {
      const u = new URL(API);
      u.search = new URLSearchParams({
        apikey: key, countryCode: 'US', classificationName: 'music', size: '100', page: String(page),
        sort: 'relevance,desc', startDateTime: start, ...(city ? { city } : {}),
      }).toString();
      const res = await fetch(u, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Ticketmaster API returned ${res.status}.`);
      const body = (await res.json()) as { _embedded?: { events?: TmEvent[] }; page?: { totalPages?: number } };
      for (const t of body._embedded?.events ?? []) {
        const e = mapEvent(t);
        if (e) out.set(e.id, e);
      }
      if (page + 1 >= (body.page?.totalPages ?? 1)) break;
    }
  }
  return [...out.values()];
}
