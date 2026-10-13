'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

export function RerollButton({ token, mode, priceLabel }: { token: string; mode: 'list' | 'cancel'; priceLabel: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/tickets/${token}/reroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: mode }),
      });
      if (res.ok || res.status === 404) {
        dialog.current?.close();
        router.refresh(); // 404 => ticket already resold; the page now shows not-found
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Something went wrong.');
      router.refresh();
    } catch {
      setError('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'cancel') {
    return (
      <>
        <button className="btn ghost block" onClick={run} disabled={busy}>{busy ? 'Cancelling…' : 'Cancel re-roll'}</button>
        {error && <div className="notice err" role="alert">{error}</div>}
        <p className="hint">If nobody has bought it yet, cancelling puts the ticket back in your hands.</p>
      </>
    );
  }

  return (
    <>
      <button className="btn ghost block" onClick={() => dialog.current?.showModal()}>Can&apos;t go? Re-roll it</button>
      <dialog ref={dialog} aria-labelledby="rr-title">
        <h3 id="rr-title">Re-roll this ticket?</h3>
        <p>
          It goes back on sale at face value ({priceLabel}) and moves to the next buyer. <strong>If it sells, this ticket
          stops working immediately</strong>, and your link and QR code will be disabled. You can cancel the re-roll any time before it sells.
        </p>
        {error && <div className="notice err" role="alert">{error}</div>}
        <div className="actions">
          <button className="btn" onClick={run} disabled={busy}>{busy ? 'Re-rolling…' : 'Yes, re-roll it'}</button>
          <button className="btn ghost" onClick={() => dialog.current?.close()} disabled={busy}>Keep my ticket</button>
        </div>
      </dialog>
      {error && !dialog.current?.open && <div className="notice err" role="alert">{error}</div>}
    </>
  );
}
