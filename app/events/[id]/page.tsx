import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BuyForm } from '@/components/BuyForm';
import { Badges, coverStyle } from '@/components/EventCard';
import { dateLong, money } from '@/lib/format';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const e = await getStore().getEvent(params.id);
  return { title: e?.title ?? 'Event' };
}

export default async function EventPage({ params }: { params: { id: string } }) {
  const e = await getStore().getEvent(params.id);
  if (!e) notFound();
  const past = new Date(e.starts_at).getTime() <= Date.now();
  return (
    <article className="detail narrow">
      <Link href="/" className="back">← All events</Link>
      <div className="cover tall" style={coverStyle(e.id)}><span className="genre">{e.genre}</span></div>
      <h1>{e.title}</h1>
      <div className="meta">{e.artist !== e.title && <>{e.artist} · </>}{dateLong(e.starts_at)}</div>
      <div className="meta">{e.venue}, {e.city}</div>
      <div className="row" style={{ marginTop: 14 }}>
        <span className="price">{money(e.price_cents)}</span>
        <Badges e={e} />
      </div>
      {e.listed > 0 && (
        <div className="notice" style={{ borderColor: 'rgba(255,106,61,.45)' }}>
          <strong>{e.listed} re-rolled at face value.</strong> Fans who couldn&apos;t go put these back on sale at {money(e.price_cents)}. The next buyer gets them first.
        </div>
      )}
      <p>{e.description}</p>
      <section className="panel" aria-labelledby="buy">
        <h2 id="buy">Get a ticket</h2>
        {past ? <div className="notice err">This event has already happened.</div>
          : <BuyForm eventId={e.id} soldOut={e.remaining === 0} priceLabel={money(e.price_cents)} />}
      </section>
    </article>
  );
}
