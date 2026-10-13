import { promises as fs } from 'node:fs';
import path from 'node:path';
import { config } from '../config';
import { isBuyable } from '../listing';
import { feeFor, payoutFor } from '../pricing';
import { seedEvents, seedListings } from '../seed';
import { newId, newToken } from '../tokens';
import {
  StoreError,
  type CreateListingInput, type EventRow, type EventWithStats, type ListingRow, type OrderRow, type OrderView,
  type PublicListing, type SellerView, type Store,
} from '../types';

interface Db { events: EventRow[]; listings: ListingRow[]; orders: OrderRow[] }

const dbPath = () => path.resolve(process.env.LOCAL_DB_PATH || '.data/db.json');

// Next.js can bundle route handlers separately, so the write queue lives on globalThis
// to guarantee ONE queue per process however many module copies exist.
const g = globalThis as unknown as { __rerollQueue?: Promise<unknown> };

/** Exclusive access: every read-modify-write runs strictly one at a time. */
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = g.__rerollQueue ?? Promise.resolve();
  const run = prev.then(fn, fn);
  g.__rerollQueue = run.catch(() => undefined);
  return run;
}

async function load(): Promise<Db> {
  try {
    const db = JSON.parse(await fs.readFile(dbPath(), 'utf8')) as Partial<Db>;
    if (db.events && db.listings && db.orders) return db as Db;
  } catch (err: any) {
    if (err?.code !== 'ENOENT') throw err;
  }
  // missing, or an old pre-marketplace file: start fresh
  const db: Db = { events: seedEvents(), listings: seedListings(), orders: [] };
  await save(db);
  return db;
}

async function save(db: Db) {
  const file = dbPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, file); // atomic
}

/** Unpaid reservations lapse and free their listing. Returns true if anything changed. */
function sweep(db: Db): boolean {
  const now = Date.now();
  let changed = false;
  for (const o of db.orders) {
    if (o.status !== 'pending_payment' || Date.parse(o.expires_at) > now) continue;
    o.status = 'expired';
    o.closed_at = new Date().toISOString();
    const l = db.listings.find((x) => x.id === o.listing_id);
    if (l?.status === 'reserved') l.status = 'active';
    changed = true;
  }
  return changed;
}

/** Read path: sweep in memory so views are accurate; persisted on the next write. */
async function read(): Promise<Db> {
  const db = await load();
  sweep(db);
  return db;
}

/** Write path: exclusive, swept, and saved only if fn says so. */
function write<T>(fn: (db: Db) => T): Promise<T> {
  return withLock(async () => {
    const db = await load();
    sweep(db);
    const out = fn(db); // throws StoreError to abort before saving
    await save(db);
    return out;
  });
}

const now = () => new Date().toISOString();
const pub = ({ seller_token, seller_phone, proof_note, stripe_account_id, ...rest }: ListingRow): PublicListing => rest;
const sortCheapest = (a: ListingRow, b: ListingRow) => a.price_cents - b.price_cents || a.created_at.localeCompare(b.created_at);

const withStats = (e: EventRow, db: Db): EventWithStats => {
  const active = db.listings.filter((l) => l.event_id === e.id && isBuyable(l));
  return { ...e, activeListings: active.length, fromPriceCents: active.length ? Math.min(...active.map((l) => l.price_cents)) : null };
};

function orderBy(db: Db, buyerToken: string): OrderRow {
  const o = db.orders.find((x) => x.buyer_token === buyerToken);
  if (!o) throw new StoreError('order_not_found');
  return o;
}
function sellerSide(db: Db, sellerToken: string) {
  const listing = db.listings.find((l) => l.seller_token === sellerToken);
  if (!listing) throw new StoreError('listing_not_found');
  const order = db.orders.find((o) => o.listing_id === listing.id && ['pending_payment', 'escrowed', 'delivered', 'disputed', 'released', 'refunded'].includes(o.status)) ?? null;
  return { listing, order };
}
const must = (cond: boolean) => { if (!cond) throw new StoreError('invalid_state'); };

function close(db: Db, o: OrderRow, status: 'released' | 'refunded') {
  o.status = status;
  o.closed_at = now();
  const l = db.listings.find((x) => x.id === o.listing_id);
  if (l && status === 'refunded') l.status = 'cancelled'; // ticket unproven: don't relist automatically
}

export const localStore: Store = {
  async listEvents(query) {
    const db = await read();
    const q = query?.trim().toLowerCase();
    const t = Date.now();
    return db.events
      .filter((e) => Date.parse(e.starts_at) > t)
      .filter((e) => !q || [e.title, e.artist, e.venue, e.city, e.genre].some((f) => f.toLowerCase().includes(q)))
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .map((e) => withStats(e, db));
  },

  async getEvent(id) {
    const db = await read();
    const e = db.events.find((x) => x.id === id);
    return e ? withStats(e, db) : null;
  },

  async upsertEvents(events) {
    return write((db) => {
      for (const e of events) {
        const i = db.events.findIndex((x) => x.id === e.id);
        if (i >= 0) db.events[i] = { ...db.events[i], ...e }; else db.events.push(e);
      }
      return events.length;
    });
  },

  async deleteEventsWithoutListings(ids) {
    return write((db) => {
      const drop = new Set(ids.filter((id) => !db.listings.some((l) => l.event_id === id)));
      db.events = db.events.filter((e) => !drop.has(e.id));
      return drop.size;
    });
  },

  async listActiveListings(eventId) {
    const db = await read();
    return db.listings.filter((l) => l.event_id === eventId && isBuyable(l)).sort(sortCheapest).map(pub);
  },

  async getListing(id) {
    const db = await read();
    const l = db.listings.find((x) => x.id === id);
    return l ? pub(l) : null;
  },

  createListing(input: CreateListingInput) {
    return write((db) => {
      const e = db.events.find((x) => x.id === input.eventId);
      if (!e) throw new StoreError('event_not_found');
      must(Date.parse(e.starts_at) > Date.now());
      const listing: ListingRow = {
        id: newId(), event_id: e.id, seller_token: newToken(), seller_phone: input.sellerPhone, seller_name: input.sellerName,
        face_value_cents: input.faceValueCents, price_cents: input.priceCents, proof_note: input.proofNote,
        status: 'active', created_at: now(), stripe_account_id: null, payouts_ready: false,
      };
      db.listings.push(listing);
      return listing;
    });
  },

  async getSellerView(sellerToken): Promise<SellerView | null> {
    const db = await read();
    const listing = db.listings.find((l) => l.seller_token === sellerToken);
    if (!listing) return null;
    const { order } = sellerSide(db, sellerToken);
    return { listing, order, event: db.events.find((e) => e.id === listing.event_id)! };
  },

  cancelListing(sellerToken) {
    return write((db) => {
      const { listing } = sellerSide(db, sellerToken);
      must(listing.status === 'active');
      listing.status = 'cancelled';
      return { ...listing };
    });
  },

  reserve(listingId, buyer) {
    return write((db) => {
      const l = db.listings.find((x) => x.id === listingId);
      if (!l) throw new StoreError('listing_not_found');
      must(isBuyable(l));
      if (l.seller_phone === buyer.phone) throw new StoreError('own_listing');
      l.status = 'reserved';
      const order: OrderRow = {
        id: newId(), listing_id: l.id, event_id: l.event_id, buyer_token: newToken(), buyer_phone: buyer.phone, buyer_name: buyer.name,
        price_cents: l.price_cents, fee_cents: feeFor(l.price_cents), payout_cents: payoutFor(l.price_cents),
        status: 'pending_payment', payment_ref: null, settlement_ref: null, delivery_note: null, dispute_reason: null,
        expires_at: new Date(Date.now() + config.reserveMinutes * 60_000).toISOString(),
        created_at: now(), paid_at: null, delivered_at: null, closed_at: null,
      };
      db.orders.push(order);
      return { ...order };
    });
  },

  async getOrderView(buyerToken): Promise<OrderView | null> {
    const db = await read();
    const order = db.orders.find((o) => o.buyer_token === buyerToken);
    if (!order) return null;
    const listing = db.listings.find((l) => l.id === order.listing_id)!;
    return { order, listing: pub(listing), event: db.events.find((e) => e.id === order.event_id)!, sellerPhone: listing.seller_phone };
  },

  async getSellerContact(listingId) {
    const l = (await read()).listings.find((x) => x.id === listingId);
    return l ? { phone: l.seller_phone, token: l.seller_token, stripeAccountId: l.stripe_account_id } : null;
  },

  async getOrderById(orderId) {
    return (await read()).orders.find((o) => o.id === orderId) ?? null;
  },

  markPaidById(orderId, paymentRef) {
    return write((db) => {
      const o = db.orders.find((x) => x.id === orderId);
      if (!o) throw new StoreError('order_not_found');
      if (o.status !== 'pending_payment') {
        if (paymentRef && o.payment_ref === paymentRef) return { ...o }; // webhook retry
        throw new StoreError('invalid_state');
      }
      o.status = 'escrowed';
      o.paid_at = now();
      o.payment_ref = paymentRef;
      const l = db.listings.find((x) => x.id === o.listing_id)!;
      l.status = 'sold';
      return { ...o };
    });
  },

  setSellerAccount(sellerToken, accountId) {
    return write((db) => {
      const l = db.listings.find((x) => x.seller_token === sellerToken);
      if (!l) throw new StoreError('listing_not_found');
      if (l.stripe_account_id && l.stripe_account_id !== accountId) throw new StoreError('invalid_state');
      l.stripe_account_id = accountId;
    });
  },

  setPayoutsReady(accountId, ready) {
    return write((db) => { for (const l of db.listings) if (l.stripe_account_id === accountId) l.payouts_ready = ready; });
  },

  setSettlementRef(orderId, ref) {
    return write((db) => {
      const o = db.orders.find((x) => x.id === orderId);
      if (!o) throw new StoreError('order_not_found');
      o.settlement_ref = ref;
    });
  },

  async listPendingSettlements() {
    return (await read()).orders.filter((o) => (o.status === 'released' || o.status === 'refunded') && o.payment_ref && !o.settlement_ref);
  },

  markDelivered(sellerToken, note) {
    return write((db) => {
      const { order } = sellerSide(db, sellerToken);
      must(!!order && order.status === 'escrowed');
      order!.status = 'delivered';
      order!.delivery_note = note;
      order!.delivered_at = now();
      return { ...order! };
    });
  },

  confirmReceived(buyerToken) {
    return write((db) => {
      const o = orderBy(db, buyerToken);
      must(o.status === 'delivered');
      close(db, o, 'released');
      return { ...o };
    });
  },

  openDispute(buyerToken, reason) {
    return write((db) => {
      const o = orderBy(db, buyerToken);
      must(o.status === 'escrowed' || o.status === 'delivered');
      o.status = 'disputed';
      o.dispute_reason = reason;
      return { ...o };
    });
  },

  sellerRefund(sellerToken) {
    return write((db) => {
      const { order } = sellerSide(db, sellerToken);
      must(!!order && order.status === 'escrowed');
      close(db, order!, 'refunded');
      return { ...order! };
    });
  },

  resolveDispute(orderId, outcome) {
    return write((db) => {
      const o = db.orders.find((x) => x.id === orderId);
      if (!o) throw new StoreError('order_not_found');
      must(o.status === 'disputed');
      close(db, o, outcome === 'release' ? 'released' : 'refunded');
      return { ...o };
    });
  },

  settleDue() {
    return write((db) => {
      const released: OrderRow[] = [], refunded: OrderRow[] = [];
      const t = Date.now();
      for (const o of db.orders) {
        const e = db.events.find((x) => x.id === o.event_id);
        if (!e) continue;
        const start = Date.parse(e.starts_at);
        if (o.status === 'delivered' && t > start + config.releaseAfterHours * 3600_000) { close(db, o, 'released'); released.push({ ...o }); }
        else if (o.status === 'escrowed' && t > start) { close(db, o, 'refunded'); refunded.push({ ...o }); }
      }
      return { released, refunded };
    });
  },
};
