'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { postJson } from './api';

export function ReserveForm({ listingId, priceLabel }: { listingId: string; priceLabel: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true); setError('');
    const r = await postJson(`/api/listings/${listingId}/reserve`, { phone, name });
    if (r.ok) { router.push(r.data.orderPath); return; }
    setError(r.data.error ?? 'Could not reserve this ticket.');
    if (r.status === 409) router.refresh();
    setBusy(false);
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="name">Name (optional)</label>
        <input id="name" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      </div>
      <div className="field">
        <label htmlFor="phone">Mobile number</label>
        <input id="phone" type="tel" inputMode="tel" autoComplete="tel" required placeholder="(555) 555-0123" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <button className="btn block" type="submit" disabled={busy}>{busy ? 'Reserving…' : `Reserve · ${priceLabel}`}</button>
      <p className="hint">We hold the ticket for you while you pay, and text you the order link.</p>
      {error && <div className="notice err" role="alert">{error}</div>}
    </form>
  );
}
