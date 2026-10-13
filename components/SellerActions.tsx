'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { postJson } from './api';

export function SellerActions({ token, listingStatus, orderStatus, needsPayouts }: { token: string; listingStatus: string; orderStatus: string | null; needsPayouts: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  async function run(action: 'cancel' | 'deliver' | 'refund' | 'payout_setup') {
    if (action === 'refund' && !window.confirm('Cancel this sale and refund the buyer in full?')) return;
    setBusy(true); setError('');
    const r = await postJson(`/api/sell/${token}`, { action, note });
    if (r.ok && r.data.redirect) { window.location.href = r.data.redirect; return; } // Stripe onboarding
    if (!r.ok) setError(r.data.error ?? 'Something went wrong.');
    router.refresh();
    setBusy(false);
  }

  return (
    <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
      {needsPayouts && listingStatus === 'active' && (
        <button className="btn block" onClick={() => run('payout_setup')} disabled={busy}>{busy ? 'Opening Stripe…' : 'Set up payouts to go live'}</button>
      )}
      {listingStatus === 'active' && (
        <button className="btn ghost block" onClick={() => run('cancel')} disabled={busy}>Take my listing down</button>
      )}
      {orderStatus === 'escrowed' && (
        <>
          <div className="field">
            <label htmlFor="note">How are you delivering the ticket?</label>
            <input id="note" type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="What you sent the buyer, and how they get in" />
            <div className="hint">The buyer sees this note. Deliver the ticket first (outside Re-Roll), then mark it delivered.</div>
          </div>
          <button className="btn block" onClick={() => run('deliver')} disabled={busy || note.trim().length < 4}>Mark as delivered</button>
          <button className="btn ghost block" onClick={() => run('refund')} disabled={busy}>I can&apos;t deliver: refund buyer</button>
        </>
      )}
      {error && <div className="notice err" role="alert">{error}</div>}
    </div>
  );
}
