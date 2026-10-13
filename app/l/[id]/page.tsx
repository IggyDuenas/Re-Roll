import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ReserveForm } from '@/components/ReserveForm';
import { Disclosure } from '@/components/shared';
import { dateLong, money } from '@/lib/format';
import { markupPct } from '@/lib/pricing';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Ticket listing' };

export default async function ListingPage({ params }: { params: { id: string } }) {
  const store = getStore();
  const l = /^[0-9a-f-]{36}$/i.test(params.id) ? await store.getListing(params.id) : null;
  if (!l) notFound();
  const e = await store.getEvent(l.event_id);
  if (!e) notFound();
  const pct = markupPct(l.face_value_cents, l.price_cents);
  const available = l.status === 'active' && Date.parse(e.starts_at) > Date.now();
  return (
    <div className="narrow">
      <Link href={`/events/${e.id}`} className="back">← {e.title}</Link>
      <div className="panel" style={{ marginTop: 0 }}>
        <h1 style={{ fontSize: '1.6rem' }}>{e.title}</h1>
        <div className="meta">{dateLong(e.starts_at)}</div>
        <div className="meta">{e.venue}, {e.city}</div>
        <div className="dotted" />
        <div className="row" style={{ marginTop: 0 }}>
          <span className="price" style={{ fontSize: '1.8rem' }}>{money(l.price_cents)}</span>
          <span className={`badge ${pct > 0 ? 'reroll' : 'left'}`}>{pct > 0 ? `+${pct}% over face` : 'Face value'}</span>
        </div>
        <div className="meta">Original face value {money(l.face_value_cents)} · sold by {l.seller_name ?? 'a fan'}</div>
        <div style={{ marginTop: 18 }}>
          {available ? <ReserveForm listingId={l.id} priceLabel={money(l.price_cents)} />
            : <div className="notice err">{l.status === 'reserved' ? 'Someone is checking out with this ticket right now. If they don’t finish, it will be back shortly.' : 'This ticket is no longer available.'}</div>}
        </div>
      </div>
      <div style={{ marginTop: 20 }}><Disclosure /></div>
    </div>
  );
}
