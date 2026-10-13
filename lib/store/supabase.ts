import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { newToken } from '../tokens';
import {
  MAX_TICKETS_PER_PHONE, StoreError,
  type EventRow, type EventWithStats, type PurchaseInput, type PurchaseResult, type Store, type TicketRow,
} from '../types';

let client: SupabaseClient | null = null;
const db = () =>
  (client ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));

const fail = (error: { message: string } | null) => {
  if (error) throw new Error(`Supabase: ${error.message}`);
};

async function countTickets(eventId: string, statuses: string[], phone?: string): Promise<number> {
  let q = db().from('tickets').select('id', { count: 'exact', head: true }).eq('event_id', eventId).in('status', statuses);
  if (phone) q = q.eq('phone', phone);
  const { count, error } = await q;
  fail(error);
  return count ?? 0;
}

async function withStats(e: EventRow): Promise<EventWithStats> {
  const [taken, listed] = await Promise.all([countTickets(e.id, ['valid', 'used']), countTickets(e.id, ['listed'])]);
  return { ...e, remaining: Math.max(e.capacity - taken, 0), listed };
}

/** After a failed conditional update, tell "token gone" (404) apart from "wrong state" (409). */
async function missOrInvalid(token: string): Promise<never> {
  const { data, error } = await db().from('tickets').select('id').eq('token', token).maybeSingle();
  fail(error);
  throw new StoreError(data ? 'invalid_state' : 'ticket_not_found');
}

export const supabaseStore: Store = {
  async listEvents(query) {
    const { data, error } = await db().from('events').select('*').gt('starts_at', new Date().toISOString()).order('starts_at');
    fail(error);
    const q = query?.trim().toLowerCase();
    const rows = ((data ?? []) as EventRow[]).filter(
      (e) => !q || [e.title, e.artist, e.venue, e.city, e.genre].some((f) => (f ?? '').toLowerCase().includes(q)),
    );
    return Promise.all(rows.map(withStats));
  },

  async getEvent(id) {
    const { data, error } = await db().from('events').select('*').eq('id', id).maybeSingle();
    fail(error);
    return data ? withStats(data as EventRow) : null;
  },

  async getTicket(token) {
    const { data, error } = await db().from('tickets').select('*').eq('token', token).maybeSingle();
    fail(error);
    return (data as TicketRow | null) ?? null;
  },

  async purchase(input: PurchaseInput): Promise<PurchaseResult> {
    const { data: event, error } = await db().from('events').select('*').eq('id', input.eventId).maybeSingle();
    fail(error);
    if (!event) throw new StoreError('event_not_found');

    if ((await countTickets(input.eventId, ['valid', 'used'], input.phone)) >= MAX_TICKETS_PER_PHONE) {
      throw new StoreError('limit_reached');
    }

    // Claim the oldest listed ticket with a conditional update. If someone else claims it first the
    // update matches zero rows, and we simply try the next-oldest one.
    for (let attempt = 0; attempt < 8; attempt++) {
      const { data: listed, error: lerr } = await db()
        .from('tickets').select('id').eq('event_id', input.eventId).eq('status', 'listed')
        .order('created_at', { ascending: true }).order('id', { ascending: true }).limit(1);
      fail(lerr);
      if (!listed?.length) break;
      const { data: claimed, error: cerr } = await db()
        .from('tickets')
        .update({ token: newToken(), phone: input.phone, holder_name: input.name, status: 'valid' })
        .eq('id', listed[0].id).eq('status', 'listed')
        .select('*');
      fail(cerr);
      if (claimed?.length) return { ticket: claimed[0] as TicketRow, resold: true };
    }

    const stats = await withStats(event as EventRow);
    if (stats.remaining <= 0) throw new StoreError('sold_out');

    // TODO(capacity race): count-then-insert is not atomic; needs a Postgres row lock / RPC.
    const { data: created, error: ierr } = await db()
      .from('tickets')
      .insert({ event_id: input.eventId, token: newToken(), phone: input.phone, holder_name: input.name, status: 'valid' })
      .select('*').single();
    fail(ierr);
    return { ticket: created as TicketRow, resold: false };
  },

  async listTicket(token) {
    const { data: t, error } = await db().from('tickets').select('event_id').eq('token', token).maybeSingle();
    fail(error);
    if (!t) throw new StoreError('ticket_not_found');
    const { data: ev, error: eerr } = await db().from('events').select('starts_at').eq('id', t.event_id).maybeSingle();
    fail(eerr);
    if (!ev || new Date(ev.starts_at).getTime() <= Date.now()) throw new StoreError('invalid_state');
    const { data, error: uerr } = await db().from('tickets').update({ status: 'listed' }).eq('token', token).eq('status', 'valid').select('*');
    fail(uerr);
    if (!data?.length) return missOrInvalid(token);
    return data[0] as TicketRow;
  },

  async cancelListing(token) {
    const { data, error } = await db().from('tickets').update({ status: 'valid' }).eq('token', token).eq('status', 'listed').select('*');
    fail(error);
    if (!data?.length) return missOrInvalid(token);
    return data[0] as TicketRow;
  },
};
