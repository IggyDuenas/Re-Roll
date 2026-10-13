'use client';
import { useMemo, useState } from 'react';
import { postJson } from './api';
import { coverStyle } from './EventCard';

export interface SellEvent { id: string; title: string; artist: string; genre: string; venue: string; city: string; when: string }
const dollars = (c: number) => `$${(c / 100).toFixed(2).replace(/\.00$/, '')}`;
const STEPS = ['Event', 'Price', 'Details'];

export function SellForm({ events, initialEvent, maxMarkupPct, feePct, needsPayouts }: { events: SellEvent[]; initialEvent: string; maxMarkupPct: number; feePct: number; needsPayouts: boolean }) {
  const [step, setStep] = useState(initialEvent && events.some((e) => e.id === initialEvent) ? 1 : 0);
  const [eventId, setEventId] = useState(initialEvent || '');
  const [q, setQ] = useState('');
  const [face, setFace] = useState('');
  const [price, setPrice] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [proof, setProof] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ devLink?: string; listingId: string } | null>(null);

  const selected = events.find((e) => e.id === eventId);
  const faceC = Math.round(parseFloat(face) * 100);
  const priceC = Math.round(parseFloat(price) * 100);
  const faceOk = faceC >= 100;
  const cap = useMemo(() => (faceOk ? Math.floor((faceC * maxMarkupPct) / 100) : 0), [faceC, faceOk, maxMarkupPct]);
  const priceOk = priceC >= 100;
  const over = faceOk && priceOk && priceC > cap;
  const fee = priceOk ? Math.round((priceC * feePct) / 100) : 0;
  const markup = faceOk && priceOk ? Math.round(((priceC - faceC) / faceC) * 100) : 0;
  const filtered = events.filter((e) => `${e.title} ${e.artist} ${e.venue} ${e.city} ${e.genre}`.toLowerCase().includes(q.toLowerCase()));
  const setPriceC = (c: number) => setPrice((Math.max(c, 0) / 100).toFixed(2));
  const canNext = step === 0 ? !!selected : step === 1 ? faceOk && priceOk && !over : false;

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
        {needsPayouts ? 'Almost there! Open your private seller link to set up payouts with Stripe. Your listing goes live to buyers as soon as that’s done. We texted you the link too.' : 'Your ticket is listed! We texted you a private link to manage it, deliver it when it sells, and track your payout.'}
        {done.devLink && <> SMS isn&apos;t configured, so open it here: <a href={done.devLink}>{done.devLink}</a></>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="wizard">
      <ol className="steps" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''}>
            <button type="button" disabled={i > step} onClick={() => setStep(i)}><span className="n">{i + 1}</span>{s}</button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section aria-label="Choose your event">
          <h2 className="step-title">Which show?</h2>
          <input type="search" className="evsearch" placeholder="Search artist, venue or city" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search events" />
          <div className="evlist" role="radiogroup" aria-label="Events">
            {filtered.map((e) => (
              <button type="button" key={e.id} role="radio" aria-checked={e.id === eventId} className={`evopt${e.id === eventId ? ' on' : ''}`} onClick={() => { setEventId(e.id); setStep(1); }}>
                <span className="mini" style={coverStyle(e.id)} aria-hidden="true">{e.artist.slice(0, 2)}</span>
                <span className="evtext"><b>{e.title}</b><small>{e.when} · {e.venue}, {e.city}</small></span>
                <span className="go" aria-hidden="true">→</span>
              </button>
            ))}
            {filtered.length === 0 && <div className="empty">No events match.</div>}
          </div>
        </section>
      )}

      {step === 1 && selected && (
        <section aria-label="Set your price">
          <button type="button" className="picked" onClick={() => setStep(0)}>
            <span className="mini" style={coverStyle(selected.id)} aria-hidden="true">{selected.artist.slice(0, 2)}</span>
            <span className="evtext"><b>{selected.title}</b><small>{selected.when} · {selected.city}</small></span>
            <span className="change">Change</span>
          </button>
          <h2 className="step-title">What did you pay?</h2>
          <label className="money"><span>$</span>
            <input id="face" type="text" inputMode="decimal" placeholder="35" value={face} onChange={(e) => setFace(e.target.value.replace(/[^0-9.]/g, ''))} aria-label="Face value you paid in USD" autoFocus />
          </label>
          {faceOk && (
            <>
              <h2 className="step-title">Your asking price</h2>
              <label className="money big"><span>$</span>
                <input id="price" type="text" inputMode="decimal" placeholder={(faceC / 100).toFixed(0)} value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))} aria-label="Your asking price in USD" />
              </label>
              <div className="chips quick" role="group" aria-label="Quick prices">
                {[{ l: 'Face value', c: faceC }, { l: '+10%', c: Math.round(faceC * 1.1) }, { l: '+25%', c: Math.round(faceC * 1.25) }, { l: `Max ${dollars(cap)}`, c: cap }].map((o) => (
                  <button type="button" key={o.l} className={`chip${priceOk && priceC === o.c ? ' on' : ''}`} onClick={() => setPriceC(o.c)}>{o.l}</button>
                ))}
              </div>
              {cap > faceC && (
                <input type="range" className="range" min={faceC} max={cap} step={50} value={priceOk ? Math.min(Math.max(priceC, faceC), cap) : faceC} onChange={(e) => setPriceC(Number(e.target.value))} aria-label="Asking price slider" />
              )}
              <div className="rangelabels"><span>{dollars(faceC)}</span><span>{dollars(cap)} max</span></div>
              {priceOk && (
                <div className={`earn${over ? ' bad' : ''}`}>
                  {over ? <>Over the {maxMarkupPct}% cap. Lower your price to {dollars(cap)} or less.</> : (
                    <>
                      <div><small>You receive</small><strong>{dollars(priceC - fee)}</strong></div>
                      <div className="breakdown">{dollars(priceC)} price − {dollars(fee)} fee ({feePct}%){markup > 0 ? ` · +${markup}% over face` : ''}</div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {step === 2 && (
        <section aria-label="Your details">
          <div className="summary">
            <div><small>{selected?.title}</small><b>{dollars(priceC)} <i>(face {dollars(faceC)})</i></b></div>
            <button type="button" className="change" onClick={() => setStep(1)}>Edit</button>
          </div>
          <div className="field">
            <label htmlFor="proof">Order reference / ticket details</label>
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
          <label className="switch">
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
            <span className="track" aria-hidden="true"><span className="knob" /></span>
            <span>I own this ticket, I&apos;ll deliver it to the buyer if it sells, and I understand the ticket issuer may not allow resale.</span>
          </label>
          <button className="btn block" type="submit" disabled={busy || over} style={{ marginTop: 18 }}>{busy ? 'Listing…' : 'List my ticket'}</button>
          {error && <div className="notice err" role="alert">{error}</div>}
        </section>
      )}

      {step === 1 && (
        <div className="nav">
          <button type="button" className="btn ghost" onClick={() => setStep(0)}>Back</button>
          <button type="button" className="btn" disabled={!canNext} onClick={() => setStep(2)}>Continue</button>
        </div>
      )}
    </form>
  );
}
