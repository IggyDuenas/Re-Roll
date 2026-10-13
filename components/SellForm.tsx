'use client';
import { useMemo, useState } from 'react';
import { postJson } from './api';

interface Opt { id: string; label: string }
const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;

export function SellForm({ events, initialEvent, maxMarkupPct, feePct, needsPayouts }: { events: Opt[]; initialEvent: string; maxMarkupPct: number; feePct: number; needsPayouts: boolean }) {
  const [eventId, setEventId] = useState(initialEvent || events[0]?.id || '');
  const [face, setFace] = useState('');
  const [price, setPrice] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [proof, setProof] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ devLink?: string; listingId: string } | null>(null);

  const faceC = Math.round(parseFloat(face) * 100);
  const priceC = Math.round(parseFloat(price) * 100);
  const cap = useMemo(() => (faceC > 0 ? Math.floor((faceC * maxMarkupPct) / 100) : 0), [faceC, maxMarkupPct]);
  const valid = faceC > 0 && priceC > 0;
  const fee = valid ? Math.round((priceC * feePct) / 100) : 0;
  const over = valid && cap > 0 && priceC > cap;

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true); setError('');
    const r = await postJson('/api/listings', { eventId, phone, name, faceValueCents: faceC, priceCents: priceC, proofNote: proof, confirmOwnership: confirm });
    setBusy(false);
    if (r.ok) setDone({ devLink: r.data.devLink, listingId: r.data.listingId });
    else setError(r.data.error ?? 'Could not create your listing.');
  }

  if (done) {
    return (
      <div className="notice ok" role="status">
        {needsPayouts ? 'Almost there! Open your private seller link to set up payouts with Stripe. Your listing goes live to buyers as soon as that\u2019s done. We texted you the link too.' : 'Your ticket is listed! We texted you a private link to manage it, deliver it when it sells, and track your payout.'}
        {done.devLink && <> SMS isn&apos;t configured, so open it here: <a href={done.devLink}>{done.devLink}</a></>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="event">Event</label>
        <select id="event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
          {events.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="face">Face value you paid (USD)</label>
        <input id="face" type="text" inputMode="decimal" placeholder="35.00" value={face} onChange={(e) => setFace(e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor="price">Your asking price (USD){cap > 0 && <> · max {dollars(cap)}</>}</label>
        <input id="price" type="text" inputMode="decimal" placeholder="45.00" value={price} onChange={(e) => setPrice(e.target.value)} required />
        {valid && (
          <div className={over ? 'hint err-text' : 'hint'}>
            {over ? `Over the ${maxMarkupPct}% cap. Lower your price.` : `You'd receive ${dollars(priceC - fee)} after our ${feePct}% fee (${dollars(fee)}).`}
          </div>
        )}
      </div>
      <div className="field">
        <label htmlFor="proof">Dice order reference / ticket details</label>
        <input id="proof" type="text" placeholder="Order #, name on the order, section…" value={proof} onChange={(e) => setProof(e.target.value)} maxLength={500} required />
        <div className="hint">Only shared with our team to resolve disputes. Never shown publicly.</div>
      </div>
      <div className="field">
        <label htmlFor="name">First name (shown to buyers, optional)</label>
        <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="given-name" />
      </div>
      <div className="field">
        <label htmlFor="phone">Mobile number (for sale alerts)</label>
        <input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(555) 555-0123" value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </div>
      <label className="check">
        <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
        <span>I own this ticket, I&apos;ll deliver it to the buyer if it sells, and I understand the ticket issuer may not allow resale.</span>
      </label>
      <button className="btn block" type="submit" disabled={busy || over} style={{ marginTop: 14 }}>{busy ? 'Listing…' : 'List my ticket'}</button>
      {error && <div className="notice err" role="alert">{error}</div>}
    </form>
  );
}
