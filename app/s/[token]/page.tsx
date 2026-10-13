import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SellerActions } from '@/components/SellerActions';
import { Disclosure, STATUS_LABEL } from '@/components/shared';
import { config } from '@/lib/config';
import { dateLong, money } from '@/lib/format';
import { getStore } from '@/lib/store';
import { isTokenShaped } from '@/lib/tokens';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your listing', robots: { index: false, follow: false } };

const COPY: Record<string, string> = {
  pending_payment: 'A buyer reserved your ticket and is checking out. You’ll get a text when they pay.',
  escrowed: 'Sold! The buyer’s payment is held in escrow. Deliver the ticket, then mark it delivered below. If it isn’t delivered before the event starts, the buyer is refunded automatically.',
  delivered: 'Marked delivered. You’ll be paid when the buyer confirms, or automatically ' + config.releaseAfterHours + 'h after the event if nobody reports a problem.',
  released: 'Complete. Your payout has been released.',
  disputed: 'The buyer reported a problem. Payment is frozen and our team will review it.',
  refunded: 'This sale was refunded to the buyer.',
};

export default async function SellerPage({ params }: { params: { token: string } }) {
  if (!isTokenShaped(params.token)) notFound();
  const v = await getStore().getSellerView(params.token);
  if (!v) notFound();
  const { listing: l, order: o, event: e } = v;
  return (
    <div className="narrow">
      <Link href={`/events/${e.id}`} className="back">← {e.title}</Link>
      <div className="panel" style={{ marginTop: 0 }}>
        <span className="status listed">{o ? STATUS_LABEL[o.status] : STATUS_LABEL[l.status]}</span>
        <h1 style={{ fontSize: '1.6rem', margin: '12px 0 4px' }}>{e.title}</h1>
        <div className="meta">{dateLong(e.starts_at)} · {e.venue}, {e.city}</div>
        <div className="dotted" />
        <div className="row" style={{ marginTop: 0 }}><span className="meta">Asking price</span><span className="price">{money(l.price_cents)}</span></div>
        <div className="row" style={{ marginTop: 4 }}><span className="meta">Platform fee ({config.feePct}%)</span><span className="meta">−{money(Math.round((l.price_cents * config.feePct) / 100))}</span></div>
        <div className="row" style={{ marginTop: 4 }}><span className="meta">You receive</span><strong>{money(o?.payout_cents ?? l.price_cents - Math.round((l.price_cents * config.feePct) / 100))}</strong></div>
        <p className="meta" style={{ marginTop: 14 }}>
          {o && COPY[o.status] ? COPY[o.status]
            : l.status === 'active' ? 'Your listing is live. We’ll text you when someone buys it.'
            : l.status === 'cancelled' ? 'This listing is no longer on sale.' : ''}
        </p>
        {o?.delivery_note && <div className="notice"><strong>Your delivery note:</strong><br />{o.delivery_note}</div>}
        {o?.dispute_reason && <div className="notice err">Buyer&apos;s report: {o.dispute_reason}</div>}
        <SellerActions token={params.token} listingStatus={l.status} orderStatus={o?.status ?? null} />
      </div>
      <div style={{ marginTop: 20 }}><Disclosure compact /></div>
    </div>
  );
}
