'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** After returning from Stripe Checkout the webhook may lag a moment: poll the page a few times. */
export function AutoRefresh({ times = 10, everyMs = 2000 }: { times?: number; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const id = setInterval(() => { router.refresh(); if (++n >= times) clearInterval(id); }, everyMs);
    return () => clearInterval(id);
  }, [router, times, everyMs]);
  return null;
}
