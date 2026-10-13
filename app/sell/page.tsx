import type { Metadata } from 'next';
import Link from 'next/link';
import { SellForm } from '@/components/SellForm';
import { Disclosure } from '@/components/shared';
import { config } from '@/lib/config';
import { dateShort } from '@/lib/format';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sell a ticket' };

export default async function SellPage({ searchParams }: { searchParams: { event?: string } }) {
  const events = await getStore().listEvents();
  return (
    <div className="narrow">
      <Link href="/" className="back">← All events</Link>
      <h1 style={{ fontSize: '2rem' }}>Sell your ticket</h1>
      <p className="meta" style={{ margin: '8px 0 0' }}>
        Set your price up to {config.maxMarkupPct}% of what you paid. We keep a {config.feePct}% fee only when it sells. Buyers pay into escrow, and you&apos;re paid once they confirm the ticket.
      </p>
      <div className="panel sell-panel">
        {events.length === 0 ? <div className="empty">No upcoming events to list against yet.</div>
          : <SellForm events={events.map((e) => ({ id: e.id, title: e.title, artist: e.artist, genre: e.genre, venue: e.venue, city: e.city, when: dateShort(e.starts_at) }))} initialEvent={searchParams.event ?? ''} maxMarkupPct={config.maxMarkupPct} feePct={config.feePct} needsPayouts={config.stripeEnabled} />}
      </div>
      <div style={{ marginTop: 20 }}><Disclosure /></div>
    </div>
  );
}
