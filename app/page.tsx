import Link from 'next/link';
import { EventCard, FeaturedEvent } from '@/components/EventCard';
import { Disclosure } from '@/components/shared';
import { config } from '@/lib/config';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: { q?: string; genre?: string } }) {
  const q = (searchParams.q ?? '').slice(0, 80);
  const genre = (searchParams.genre ?? '').slice(0, 40);
  const all = await getStore().listEvents(q);
  const genres = Array.from(new Set(all.map((e) => e.genre))).sort();
  const events = genre ? all.filter((e) => e.genre === genre) : all;
  const featured = !q && !genre ? (events.find((e) => e.activeListings > 0) ?? events[0]) : undefined;
  const rest = featured ? events.filter((e) => e.id !== featured.id) : events;
  const href = (g?: string) => (g ? `/?genre=${encodeURIComponent(g)}${q ? `&q=${encodeURIComponent(q)}` : ''}` : q ? `/?q=${encodeURIComponent(q)}` : '/');
  return (
    <>
      <section className="p2p" aria-label="How re·roll works">
        <h1>Tickets, fan to fan.</h1>
        <p>Can&apos;t make it? Sell your ticket straight to another fan. No middleman marking it up: prices are capped and every payment is held in escrow until the ticket is delivered.</p>
        <ol className="how">
          <li><b>1</b><span><strong>List</strong>Set your price, capped at {config.maxMarkupPct}% of face value.</span></li>
          <li><b>2</b><span><strong>Pay safely</strong>The buyer&apos;s payment is held in escrow.</span></li>
          <li><b>3</b><span><strong>Get paid</strong>Ticket delivered and confirmed, money released to you.</span></li>
        </ol>
      </section>
      <form className="search" role="search" action="/" method="get">
        <input type="search" name="q" defaultValue={q} placeholder="Search artists, venues, cities" aria-label="Search events" />
        {genre && <input type="hidden" name="genre" value={genre} />}
      </form>
      {featured && <FeaturedEvent e={featured} />}
      <div className="chips" role="navigation" aria-label="Filter by genre">
        <Link href={href()} className={`chip${!genre ? ' on' : ''}`}>All</Link>
        {genres.map((g) => <Link key={g} href={href(g)} className={`chip${genre === g ? ' on' : ''}`}>{g}</Link>)}
      </div>
      <div className="section-head">
        <h2>{q ? `Results for “${q}”` : genre ? genre : 'Coming up'}</h2>
        <Link href="/sell" className="seeall">Sell a ticket →</Link>
      </div>
      {rest.length === 0 && !featured ? (
        <div className="empty">{q ? <>No events match &ldquo;{q}&rdquo;.</> : 'No upcoming events yet.'}</div>
      ) : (
        <div className="grid">{rest.map((e) => <EventCard key={e.id} e={e} />)}</div>
      )}
      <div style={{ marginTop: 40 }}><Disclosure /></div>
    </>
  );
}
