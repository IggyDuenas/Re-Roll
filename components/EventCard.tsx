import Link from 'next/link';
import { dateShort, hueOf, money } from '@/lib/format';
import type { EventWithStats } from '@/lib/types';

export function coverStyle(seed: string) {
  const h = hueOf(seed);
  return { background: `linear-gradient(135deg, hsl(${h} 70% 38%), hsl(${(h + 70) % 360} 65% 22%) 70%, #0a0a0f)` };
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
    <Link href={`/events/${e.id}`} className="card">
      <div className="cover" style={coverStyle(e.id)}><span className="genre">{e.genre}</span></div>
      <div className="body">
        <h3>{e.title}</h3>
        <div className="meta">{dateShort(e.starts_at)} · {e.venue}, {e.city}</div>
        <div className="row">
          <span className="price">{e.fromPriceCents != null ? <>from {money(e.fromPriceCents)}</> : <span className="meta">Face {money(e.price_cents)}</span>}</span>
          <Badges e={e} />
        </div>
      </div>
    </Link>
  );
}
