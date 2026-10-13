import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';
import { feeFor, payoutFor } from '../pricing';
import { newToken } from '../tokens';
import {
  StoreError,
  type CreateListingInput, type EventRow, type EventWithStats, type ListingRow, type OrderRow, type OrderStatus,
  type PublicListing, type Store,
} from '../types';

let client: SupabaseClient | null = null;
const db = () =>
  (client ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));

const fail = (error: { message: string } | null) => {
  if (error) throw new Error(`Supabase: ${error.message}`);
};
const now = () => new Date().toISOString();
const pub = ({ seller_token, seller_phone, proof_note, ...rest }: ListingRow): PublicListing => rest;
const PUBLIC_COLS = 'id,event_id,seller_name,face_value_cents,price_cents,status,created_at';

/** Unpaid reservations lapse and free their listing (each step is a conditional update, so races are safe). */
async function sweep() {
  const { data, error } = await db().from('orders').select('id,listing_id').eq('status', 'pending_payment').lt('expires_at', now());
  fail(error);
  for (const o of data ?? []) {
    const { data: done, error: e1 } = await db().from('orders').update({ status: 'expired', closed_at: now() }).eq('id', o.id).eq('status', 'pending_payment').select('id');
    fail(e1);
    if (done?.length) fail((await db().from('listings').update({ status: 'active' }).eq('id', o.listing_id).eq('status', 'reserved')).error);
  }
}

/** Conditional order transition: where status in `from`. Zero rows => 404 or 409. */
async function transition(match: { col: 'buyer_token' | 'id' | 'listing_id'; val: string }, from: OrderStatus[], patch: Record<string, unknown>): Promise<OrderRow> {
  await sweep();
  const { data, error } = await db().from('orders').update(patch).eq(match.col, match.val).in('status', from).select('*');
  fail(error);
  if (data?.length) return data[0] as OrderRow;
  const { data: exists, error: e2 } = await db().from('orders').select('id').eq(match.col, match.val).in('status', ['pending_payment', 'escrowed', 'delivered', 'disputed', 'released', 'refunded']).limit(1);
  fail(e2);
  throw new StoreError(exists?.length ? 'invalid_state' : 'order_not_found');
}

async function closeOrder(o: OrderRow, status: 'released' | 'refunded') {
  if (status === 'refunded') fail((await db().from('listings').update({ status: 'cancelled' }).eq('id', o.listing_id)).error);
  return o;
}

async function sellerListing(token: string): Promise<ListingRow> {
  const { data, error } = await db().from('listings').select('*').eq('seller_token', token).maybeSingle();
  fail(error);
  if (!data) throw new StoreError('listing_not_found');
  return data as ListingRow;
}

async function withStats(e: EventRow): Promise<EventWithStats> {
  const { data, error } = await db().from('listings').select('price_cents').eq('event_id', e.id).eq('status', 'active');
  fail(error);
  const prices = (data ?? []).map((r) => r.price_cents as number);
  return { ...e, activeListings: prices.length, fromPriceCents: prices.length ? Math.min(...prices) : null };
}

export const supabaseStore: Store = {
  async listEvents(query) {
    await sweep();
    const { data, error } = await db().from('events').select('*').gt('starts_at', now()).order('starts_at');
    fail(error);
    const q = query?.trim().toLowerCase();
    const rows = ((data ?? []) as EventRow[]).filter((e) => !q || [e.title, e.artist, e.venue, e.city, e.genre].some((f) => (f ?? '').toLowerCase().includes(q)));
    return Promise.all(rows.map(withStats));
  },

  async getEvent(id) {
    await sweep();
    const { data, error } = await db().from('events').select('*').eq('id', id).maybeSingle();
    fail(error);
    return data ? withStats(data as EventRow) : null;
  },

  async listActiveListings(eventId) {
    await sweep();
    const { data, error } = await db().from('listings').select(PUBLIC_COLS).eq('event_id', eventId).eq('status', 'active')
      .order('price_cents').order('created_at');
    fail(error);
    return (data ?? []) as PublicListing[];
  },

  async getListing(id) {
    await sweep();
    const { data, error } = await db().from('listings').select(PUBLIC_COLS).eq('id', id).maybeSingle();
    fail(error);
    return (data as PublicListing | null) ?? null;
  },

  async createListing(input: CreateListingInput) {
    const { data: ev, error } = await db().from('events').select('starts_at').eq('id', input.eventId).maybeSingle();
    fail(error);
    if (!ev) throw new StoreError('event_not_found');
    if (Date.parse(ev.starts_at) <= Date.now()) throw new StoreError('invalid_state');
    const { data, error: ierr } = await db().from('listings').insert({
      event_id: input.eventId, seller_token: newToken(), seller_phone: input.sellerPhone, seller_name: input.sellerName,
      face_value_cents: input.faceValueCents, price_cents: input.priceCents, proof_note: input.proofNote, status: 'active',
    }).select('*').single();
    fail(ierr);
    return data as ListingRow;
  },

  async getSellerView(token) {
    await sweep();
    const { data: listing, error } = await db().from('listings').select('*').eq('seller_token', token).maybeSingle();
    fail(error);
    if (!listing) return null;
    const { data: orders, error: oerr } = await db().from('orders').select('*').eq('listing_id', listing.id).neq('status', 'expired').order('created_at', { ascending: false }).limit(1);
    fail(oerr);
    const { data: event, error: eerr } = await db().from('events').select('*').eq('id', listing.event_id).single();
    fail(eerr);
    return { listing: listing as ListingRow, order: (orders?.[0] as OrderRow) ?? null, event: event as EventRow };
  },

  async cancelListing(token) {
    const l = await sellerListing(token);
    const { data, error } = await db().from('listings').update({ status: 'cancelled' }).eq('id', l.id).eq('status', 'active').select('*');
    fail(error);
    if (!data?.length) throw new StoreError('invalid_state');
    return data[0] as ListingRow;
  },

  async reserve(listingId, buyer) {
    await sweep();
    const { data: l, error } = await db().from('listings').select('*').eq('id', listingId).maybeSingle();
    fail(error);
    if (!l) throw new StoreError('listing_not_found');
    if (l.seller_phone === buyer.phone) throw new StoreError('own_listing');
    // Claim with a conditional update: only one buyer can flip active -> reserved.
    const { data: claimed, error: cerr } = await db().from('listings').update({ status: 'reserved' }).eq('id', listingId).eq('status', 'active').select('price_cents');
    fail(cerr);
    if (!claimed?.length) throw new StoreError('invalid_state');
    const { data: order, error: ierr } = await db().from('orders').insert({
      listing_id: l.id, event_id: l.event_id, buyer_token: newToken(), buyer_phone: buyer.phone, buyer_name: buyer.name,
      price_cents: l.price_cents, fee_cents: feeFor(l.price_cents), payout_cents: payoutFor(l.price_cents),
      status: 'pending_payment', expires_at: new Date(Date.now() + config.reserveMinutes * 60_000).toISOString(),
    }).select('*').single();
    if (ierr) {
      await db().from('listings').update({ status: 'active' }).eq('id', listingId).eq('status', 'reserved');
      fail(ierr);
    }
    return order as OrderRow;
  },

  async getOrderView(token) {
    await sweep();
    const { data: order, error } = await db().from('orders').select('*').eq('buyer_token', token).maybeSingle();
    fail(error);
    if (!order) return null;
    const { data: listing, error: lerr } = await db().from('listings').select('*').eq('id', order.listing_id).single();
    fail(lerr);
    const { data: event, error: eerr } = await db().from('events').select('*').eq('id', order.event_id).single();
    fail(eerr);
    return { order: order as OrderRow, listing: pub(listing as ListingRow), event: event as EventRow, sellerPhone: (listing as ListingRow).seller_phone };
  },

  async getSellerContact(listingId) {
    const { data, error } = await db().from('listings').select('seller_phone,seller_token').eq('id', listingId).maybeSingle();
    fail(error);
    return data ? { phone: data.seller_phone as string, token: data.seller_token as string } : null;
  },

  async markPaid(token) {
    const o = await transition({ col: 'buyer_token', val: token }, ['pending_payment'], { status: 'escrowed', paid_at: now() });
    fail((await db().from('listings').update({ status: 'sold' }).eq('id', o.listing_id)).error);
    return o;
  },

  async markDelivered(sellerToken, note) {
    const l = await sellerListing(sellerToken);
    return transition({ col: 'listing_id', val: l.id }, ['escrowed'], { status: 'delivered', delivery_note: note, delivered_at: now() });
  },

  confirmReceived: async (token) => closeOrder(await transition({ col: 'buyer_token', val: token }, ['delivered'], { status: 'released', closed_at: now() }), 'released'),

  openDispute: (token, reason) => transition({ col: 'buyer_token', val: token }, ['escrowed', 'delivered'], { status: 'disputed', dispute_reason: reason }),

  async sellerRefund(sellerToken) {
    const l = await sellerListing(sellerToken);
    return closeOrder(await transition({ col: 'listing_id', val: l.id }, ['escrowed'], { status: 'refunded', closed_at: now() }), 'refunded');
  },

  async resolveDispute(orderId, outcome) {
    const status = outcome === 'release' ? 'released' : 'refunded';
    return closeOrder(await transition({ col: 'id', val: orderId }, ['disputed'], { status, closed_at: now() }), status);
  },

  async settleDue() {
    const released: OrderRow[] = [], refunded: OrderRow[] = [];
    const { data, error } = await db().from('orders').select('*, events:event_id(starts_at)').in('status', ['delivered', 'escrowed']);
    fail(error);
    const t = Date.now();
    for (const row of (data ?? []) as any[]) {
      const start = Date.parse(row.events.starts_at);
      const { events, ...o } = row;
      if (o.status === 'delivered' && t > start + config.releaseAfterHours * 3600_000) {
        released.push(await closeOrder(await transition({ col: 'id', val: o.id }, ['delivered'], { status: 'released', closed_at: now() }).catch(() => o), 'released'));
      } else if (o.status === 'escrowed' && t > start) {
        refunded.push(await closeOrder(await transition({ col: 'id', val: o.id }, ['escrowed'], { status: 'refunded', closed_at: now() }).catch(() => o), 'refunded'));
      }
    }
    return { released, refunded };
  },
};
