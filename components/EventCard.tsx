import Link from 'next/link';
import { dateShort, hueOf, money } from '@/lib/format';
import type { EventRow, EventWithStats } from '@/lib/types';

export function coverStyle(seed: string) {
  const h = hueOf(seed);
  const l = 14 + (h % 5) * 4; // 14-30% grey
  const angle = 120 + (h % 7) * 20;
  return {
    background: `radial-gradient(120% 80% at ${20 + (h % 5) * 15}% 0%, rgba(255,255,255,.28), transparent 60%), linear-gradient(${angle}deg, hsl(0 0% ${l + 14}%), hsl(0 0% ${l}%) 60%, #000)`,
  };
}

/** Generated poster art: the artist name set large, like a gig poster. */
export function Poster({ e, large = false }: { e: Pick<EventRow, 'id' | 'genre' | 'artist'>; large?: boolean }) {
  return (
    <div className={`poster${large ? ' large' : ''}`} style={coverStyle(e.id)} aria-hidden="true">
      <span className="genre">{e.genre}</span>
      <span className="art">{e.artist}</span>
    </div>
  );
}

export function Badges({ e }: { e: EventWithStats }) {
  return (
    <div className="badges">
      {e.activeListings > 0
        ? <span className="badge left">{e.activeListings} {e.activeListings === 1 ? 'ticket' : 'tickets'}</span>
        : <span className="badge">No tickets yet</span>}
    </div>
  );
}

export function EventCard({ e }: { e: EventWithStats }) {
  return (
    <Link href={`/events/${e.id}`} className="ecard">
      <Poster e={e} />
      <div className="ebody">
        <div className="edate">{dateShort(e.starts_at)}</div>
        <h3>{e.title}</h3>
        <div className="meta">{e.venue}, {e.city}</div>
        <div className="eprice">
          {e.activeListings > 0 && e.fromPriceCents != null
            ? <><b>From {money(e.fromPriceCents)}</b><span className="dot">·</span>{e.activeListings} {e.activeListings === 1 ? 'ticket' : 'tickets'}</>
            : <span className="muted">No tickets yet · Face {money(e.price_cents)}</span>}
        </div>
      </div>
    </Link>
  );
}

export function FeaturedEvent({ e }: { e: EventWithStats }) {
  return (
    <Link href={`/events/${e.id}`} className="feature" style={coverStyle(e.id)}>
      <div className="feature-text">
        <span className="chip solid">{e.genre}</span>
        <h2>{e.title}</h2>
        <div className="feature-meta">{dateShort(e.starts_at)} · {e.venue}, {e.city}</div>
        <span className="btn light">{e.activeListings > 0 && e.fromPriceCents != null ? `Get tickets from ${money(e.fromPriceCents)}` : 'View event'}</span>
      </div>
      <span className="feature-art" aria-hidden="true">{e.artist}</span>
    </Link>
  );
}
