'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { postJson } from './api';

export function OrderActions({ token, status, priceLabel, demo }: { token: string; status: string; priceLabel: string; demo: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [reporting, setReporting] = useState(false);

  async function run(action: 'pay' | 'confirm' | 'dispute') {
    setBusy(true); setError('');
    const r = await postJson(`/api/orders/${token}`, { action, reason });
    if (r.ok && r.data.redirect) { window.location.href = r.data.redirect; return; } // Stripe Checkout
    if (!r.ok) setError(r.data.error ?? 'Something went wrong.');
    router.refresh();
    setBusy(false);
    if (r.ok) setReporting(false);
  }

  return (
    <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
      {status === 'pending_payment' && (
        <button className="btn block" onClick={() => run('pay')} disabled={busy}>{busy ? 'Processing…' : `${demo ? 'Pay (demo) ' : 'Pay '}${priceLabel} into escrow`}</button>
      )}
      {status === 'delivered' && (
        <button className="btn block" onClick={() => run('confirm')} disabled={busy}>{busy ? 'Releasing…' : 'I got my ticket: release payment'}</button>
      )}
      {(status === 'escrowed' || status === 'delivered') && !reporting && (
        <button className="btn ghost block" onClick={() => setReporting(true)}>Report a problem</button>
      )}
      {reporting && (
        <div className="field">
          <label htmlFor="reason">What went wrong?</label>
          <input id="reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Ticket was invalid, seller unresponsive…" />
          <button className="btn block" onClick={() => run('dispute')} disabled={busy || reason.trim().length < 4}>Submit report: freeze payment</button>
        </div>
      )}
      {error && <div className="notice err" role="alert">{error}</div>}
    </div>
  );
}
