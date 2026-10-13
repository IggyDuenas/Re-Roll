import { NextResponse } from 'next/server';
import { StoreError } from './types';

export const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export function errorResponse(err: unknown) {
  if (err instanceof StoreError) {
    switch (err.code) {
      case 'event_not_found': return json({ error: 'Event not found.', code: err.code }, 404);
      case 'ticket_not_found': return json({ error: 'This ticket no longer exists. It may have been resold.', code: err.code }, 404);
      case 'sold_out': return json({ error: 'Sold out.', code: err.code }, 409);
      case 'limit_reached': return json({ error: 'Limit of 4 tickets per phone number for this event.', code: err.code }, 409);
      case 'invalid_state': return json({ error: 'That action is not available for this ticket right now.', code: err.code }, 409);
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
