import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { coverStyle } from '@/components/EventCard';
import { Disclosure } from '@/components/shared';
import { dateLong, money } from '@/lib/format';
import { markupPct } from '@/lib/pricing';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const e = await getStore().getEvent(params.id);
  return { title: e?.title ?? 'Event' };
}

export default async function EventPage({ params }: { params: { id: string } }) {
  const store = getStore();
  const e = await store.getEvent(params.id);
  if (!e) notFound();
  const past = new Date(e.starts_at).getTime() <= Date.now();
  const listings = past ? [] : await store.listActiveListings(e.id);
  return (
    <article className="detail narrow">
      <Link href="/" className="back">← All events</Link>
      <div className="cover tall" style={coverStyle(e.id)}><span className="genre">{e.genre}</span></div>
      <h1>{e.title}</h1>
      <div className="meta">{e.artist !== e.title && <>{e.artist} · </>}{dateLong(e.starts_at)}</div>
      <div className="meta">{e.venue}, {e.city}</div>
      <p>{e.description}</p>

      <section className="panel" aria-labelledby="tix">
        <div className="row" style={{ marginTop: 0, marginBottom: 12 }}>
          <h2 id="tix" style={{ margin: 0 }}>Tickets from fans</h2>
          {!past && <Link className="btn ghost" href={`/sell?event=${e.id}`}>Sell yours</Link>}
        </div>
        {past ? <div className="notice err">This event has already happened.</div>
          : listings.length === 0 ? <div className="empty">No tickets listed yet. Check back or list yours.</div>
          : (
            <ul className="listings">
              {listings.map((l) => {
                const pct = markupPct(l.face_value_cents, l.price_cents);
                return (
                  <li key={l.id}>
                    <Link href={`/l/${l.id}`} className="listing">
                      <div>
                        <div className="price">{money(l.price_cents)}</div>
                        <div className="meta">Face value {money(l.face_value_cents)} · {l.seller_name ?? 'A fan'}</div>
                      </div>
                      <span className={`badge ${pct > 0 ? 'reroll' : 'left'}`}>{pct > 0 ? `+${pct}% over face` : 'Face value'}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
      </section>
      <div style={{ marginTop: 20 }}><Disclosure compact /></div>
    </article>
  );
}
