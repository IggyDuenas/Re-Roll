import Link from 'next/link';
import { EventCard } from '@/components/EventCard';
import { Disclosure } from '@/components/shared';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: { q?: string } }) {
  const q = (searchParams.q ?? '').slice(0, 80);
  const events = await getStore().listEvents(q);
  return (
    <>
      <section className="hero">
        <h1>Skip the waitlist. <em>Buy from a fan.</em></h1>
        <p>Sold-out show? Fans who can&apos;t go sell their tickets here, with prices capped and your payment held in escrow until the ticket checks out.</p>
        <Link className="btn" href="/sell">Sell a ticket</Link>
      </section>
      <form className="search" role="search" action="/" method="get" style={{ marginTop: 24 }}>
        <input type="search" name="q" defaultValue={q} placeholder="Search artist, venue, city or genre" aria-label="Search events" />
        <button className="btn" type="submit">Search</button>
      </form>
      {events.length === 0 ? (
        <div className="empty">{q ? <>No events match &ldquo;{q}&rdquo;.</> : 'No upcoming events yet.'}</div>
      ) : (
        <div className="grid">{events.map((e) => <EventCard key={e.id} e={e} />)}</div>
      )}
      <div style={{ marginTop: 28 }}><Disclosure /></div>
    </>
  );
}
