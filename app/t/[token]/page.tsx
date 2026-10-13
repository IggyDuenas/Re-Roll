import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { RerollButton } from '@/components/RerollButton';
import { dateLong, money } from '@/lib/format';
import { getStore } from '@/lib/store';
import { isTokenShaped } from '@/lib/tokens';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your ticket', robots: { index: false, follow: false } };

const LABEL = { valid: 'Valid', listed: 'Re-rolled', used: 'Used', returned: 'Returned' } as const;

export default async function TicketPage({ params }: { params: { token: string } }) {
  if (!isTokenShaped(params.token)) notFound();
  const store = getStore();
  const ticket = await store.getTicket(params.token);
  if (!ticket) notFound(); // never existed, or already resold: the old link is dead
  const event = await store.getEvent(ticket.event_id);
  if (!event) notFound();

  const upcoming = new Date(event.starts_at).getTime() > Date.now();
  const showQr = ticket.status === 'valid' || ticket.status === 'used';
  const qr = showQr ? await QRCode.toDataURL(ticket.token, { margin: 1, width: 480, errorCorrectionLevel: 'M' }) : null;

  return (
    <div className="ticket narrow">
      <Link href={`/events/${event.id}`} className="back">← {event.title}</Link>
      <div className="panel" style={{ marginTop: 0 }}>
        <span className={`status ${ticket.status}`}>{LABEL[ticket.status]}</span>
        <h1 style={{ fontSize: '1.7rem', margin: '12px 0 4px' }}>{event.title}</h1>
        <div className="meta">{dateLong(event.starts_at)}</div>
        <div className="meta">{event.venue}, {event.city}</div>
        {ticket.holder_name && <div className="meta">Admit: {ticket.holder_name}</div>}

        <div className="dotted" />

        {showQr && qr && (
          <>
            <div className="qr"><img src={qr} alt="Ticket QR code" width={300} height={300} /></div>
            <div className="hint">{ticket.status === 'used' ? 'This ticket has been scanned.' : 'Show this at the door.'}</div>
          </>
        )}
        {ticket.status === 'listed' && (
          <>
            <h2 style={{ fontSize: '1.2rem' }}>Re-rolled, back on sale at face value</h2>
            <p className="meta" style={{ margin: '8px 0 16px' }}>
              Listed at {money(event.price_cents)}. Your QR is hidden while it&apos;s for sale, and it stops working for good the moment someone buys it.
            </p>
            <RerollButton token={ticket.token} mode="cancel" priceLabel={money(event.price_cents)} />
          </>
        )}
        {ticket.status === 'valid' && upcoming && (
          <div style={{ marginTop: 20 }}>
            <RerollButton token={ticket.token} mode="list" priceLabel={money(event.price_cents)} />
          </div>
        )}
        {ticket.status === 'valid' && !upcoming && <div className="hint">This event has passed.</div>}
        {ticket.status === 'returned' && <p className="meta">This ticket was returned.</p>}
      </div>
    </div>
  );
}
