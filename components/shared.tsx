import { config } from '@/lib/config';
import { payments } from '@/lib/payments';

export function Disclosure({ compact = false }: { compact?: boolean }) {
  return (
    <div className="notice" role="note">
      {payments.isDemo && <p style={{ margin: '0 0 8px' }}><strong className="demo">Demo mode:</strong> payments are simulated, so no money moves.</p>}
      <p style={{ margin: 0 }}>
        Re-Roll is an independent peer-to-peer marketplace connecting fans directly, and is not affiliated with event organizers or ticketing companies. Payment is held in escrow
        until the buyer confirms the ticket, and refunded if the seller can&apos;t deliver or the event starts first.
        {!compact && <> Ticket issuers can cancel resold tickets and may not permit resale, so only buy if you accept that risk. Resale prices are capped at {config.maxMarkupPct}% of face value.</>}
      </p>
    </div>
  );
}

export const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Awaiting payment', escrowed: 'Paid, in escrow', delivered: 'Delivered',
  released: 'Complete', disputed: 'In dispute', refunded: 'Refunded', expired: 'Reservation expired',
  active: 'Live', reserved: 'Reserved', sold: 'Sold', cancelled: 'Cancelled',
};
