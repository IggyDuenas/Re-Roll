import { EventCard } from '@/components/EventCard';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: { q?: string } }) {
  const q = (searchParams.q ?? '').slice(0, 80);
  const events = await getStore().listEvents(q);
  return (
    <>
      <section className="hero">
        <h1>Can&apos;t go? <em>Re-roll it.</em></h1>
        <p>Live tickets at face value. If plans change, your ticket goes back on sale at the price you paid and moves to the next fan. Never a markup.</p>
      </section>
      <form className="search" role="search" action="/" method="get">
        <input type="search" name="q" defaultValue={q} placeholder="Search artist, venue, city or genre" aria-label="Search events" />
        <button className="btn" type="submit">Search</button>
      </form>
      {events.length === 0 ? (
        <div className="empty">{q ? <>No events match &ldquo;{q}&rdquo;.</> : 'No upcoming events yet.'}</div>
      ) : (
        <div className="grid">{events.map((e) => <EventCard key={e.id} e={e} />)}</div>
      )}
    </>
  );
}
