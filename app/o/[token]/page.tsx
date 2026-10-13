import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AutoRefresh } from '@/components/AutoRefresh';
import { OrderActions } from '@/components/OrderActions';
import { Disclosure, STATUS_LABEL } from '@/components/shared';
import { dateLong, money } from '@/lib/format';
import { payments } from '@/lib/payments';
import { getStore } from '@/lib/store';
import { isTokenShaped } from '@/lib/tokens';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your order', robots: { index: false, follow: false } };

const COPY: Record<string, string> = {
  pending_payment: 'Your ticket is reserved. Pay to lock it in before the timer runs out.',
  escrowed: 'Paid. Your money is held in escrow while the seller delivers your ticket. We’ll text you when it’s sent. If it isn’t delivered before the event starts, you’re refunded automatically.',
  delivered: 'The seller says they’ve delivered your ticket. Check it, then release payment, or report a problem.',
  released: 'All done. Payment was released to the seller. Enjoy the show!',
  disputed: 'We froze the payment and our team will review your report.',
  refunded: 'You were refunded in full.',
  expired: 'This reservation expired and the ticket went back on sale.',
};

export default async function OrderPage({ params, searchParams }: { params: { token: string }; searchParams: { paid?: string } }) {
  if (!isTokenShaped(params.token)) notFound();
  const view = await getStore().getOrderView(params.token);
  if (!view) notFound();
  const { order: o, event: e } = view;
  return (
    <div className="narrow">
      <Link href={`/events/${e.id}`} className="back">← {e.title}</Link>
      <div className="panel" style={{ marginTop: 0 }}>
        <span className={`status ${o.status === 'released' ? 'valid' : o.status === 'pending_payment' || o.status === 'escrowed' || o.status === 'delivered' ? 'listed' : 'used'}`}>{STATUS_LABEL[o.status]}</span>
        <h1 style={{ fontSize: '1.6rem', margin: '12px 0 4px' }}>{e.title}</h1>
        <div className="meta">{dateLong(e.starts_at)}</div>
        <div className="meta">{e.venue}, {e.city}</div>
        <div className="dotted" />
        <div className="row" style={{ marginTop: 0 }}><span className="meta">Ticket price</span><span className="price">{money(o.price_cents)}</span></div>
        <p className="meta" style={{ marginTop: 12 }}>{COPY[o.status]}</p>
        {o.status === 'pending_payment' && searchParams.paid === '1' && (
          <div className="notice ok" role="status"><AutoRefresh />Thanks! We\u2019re confirming your payment with Stripe. This page updates automatically.</div>
        )}
        {o.status === 'pending_payment' && <p className="hint">Reservation expires {new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: process.env.APP_TIMEZONE || 'America/New_York' }).format(new Date(o.expires_at))}.</p>}
        {o.delivery_note && (
          <div className="notice"><strong>From the seller:</strong><br />{o.delivery_note}</div>
        )}
        {o.status === 'disputed' && o.dispute_reason && <div className="notice">Your report: {o.dispute_reason}</div>}
        {o.status !== 'expired' && o.status !== 'released' && o.status !== 'refunded' && o.status !== 'disputed' && (
          <OrderActions token={params.token} status={o.status} priceLabel={money(o.price_cents)} demo={payments.isDemo} />
        )}
      </div>
      <div style={{ marginTop: 20 }}><Disclosure compact /></div>
    </div>
  );
}
