'use client';
import { useState } from 'react';

type Result = { kind: 'ok'; resold: boolean; devLink?: string } | { kind: 'err'; message: string } | null;

export function BuyForm({ eventId, soldOut, priceLabel }: { eventId: string; soldOut: boolean; priceLabel: string }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, phone, name }),
      });
      const data = await res.json();
      if (res.ok) setResult({ kind: 'ok', resold: data.resold, devLink: data.devLink });
      else setResult({ kind: 'err', message: data.error ?? 'Could not complete purchase.' });
    } catch {
      setResult({ kind: 'err', message: 'Network error. Try again.' });
    } finally {
      setBusy(false);
    }
  }

  if (soldOut) return <div className="notice err" role="status">Sold out. Check back: fans re-roll tickets all the time.</div>;

  return (
    <form onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="name">Name (optional)</label>
        <input id="name" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </div>
      <div className="field">
        <label htmlFor="phone">Mobile number</label>
        <input id="phone" type="tel" inputMode="tel" autoComplete="tel" required placeholder="(555) 555-0123" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <button className="btn block" type="submit" disabled={busy}>{busy ? 'Getting your ticket…' : `Get ticket · ${priceLabel}`}</button>
      <p className="hint">We text your ticket link to this number. Up to 4 tickets per number. Payments aren&apos;t live in this demo.</p>
      {result?.kind === 'err' && <div className="notice err" role="alert">{result.message}</div>}
      {result?.kind === 'ok' && (
        <div className="notice ok" role="status">
          {result.resold ? 'Got one! This was a re-rolled ticket at face value. ' : 'You’re in! '}
          Your ticket link is on its way by text.
          {result.devLink && <> SMS isn&apos;t configured, so open it here: <a href={result.devLink}>{result.devLink}</a></>}
        </div>
      )}
    </form>
  );
}
