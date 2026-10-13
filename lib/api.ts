import { NextResponse } from 'next/server';
import { StoreError } from './types';

export const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export function errorResponse(err: unknown) {
  if (err instanceof StoreError) {
    switch (err.code) {
      case 'event_not_found': return json({ error: 'Event not found.', code: err.code }, 404);
      case 'listing_not_found': return json({ error: 'Listing not found.', code: err.code }, 404);
      case 'order_not_found': return json({ error: 'Order not found.', code: err.code }, 404);
      case 'own_listing': return json({ error: "You can't buy your own listing.", code: err.code }, 409);
      case 'invalid_state': return json({ error: 'That action is not available right now. The page may be out of date.', code: err.code }, 409);
    }
  }
  console.error('[re·roll api]', err);
  return json({ error: 'Something went wrong.' }, 500);
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Constant-ish check of `Authorization: Bearer <secret>`; fails closed when the secret isn't configured. */
export function hasBearer(req: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const got = req.headers.get('authorization') ?? '';
  const want = `Bearer ${secret}`;
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}
