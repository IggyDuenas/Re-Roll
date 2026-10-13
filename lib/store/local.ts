import { promises as fs } from 'node:fs';
import path from 'node:path';
import { seedEvents, seedTickets } from '../seed';
import { newId, newToken } from '../tokens';
import {
  MAX_TICKETS_PER_PHONE, StoreError,
  type EventRow, type EventWithStats, type PurchaseInput, type PurchaseResult, type Store, type TicketRow,
} from '../types';

interface Db { events: EventRow[]; tickets: TicketRow[] }

const dbPath = () => path.resolve(process.env.LOCAL_DB_PATH || '.data/db.json');

// Next.js can bundle route handlers separately, so the write queue lives on globalThis
// to guarantee ONE queue per process no matter how many module copies exist.
const g = globalThis as unknown as { __rerollQueue?: Promise<unknown> };

/** Run fn with exclusive access to the db: read-modify-write is strictly serialized. */
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = g.__rerollQueue ?? Promise.resolve();
  const run = prev.then(fn, fn);
  g.__rerollQueue = run.catch(() => undefined);
  return run;
}

async function load(): Promise<Db> {
  try {
    return JSON.parse(await fs.readFile(dbPath(), 'utf8')) as Db;
  } catch (err: any) {
    if (err?.code !== 'ENOENT') throw err;
    const db: Db = { events: seedEvents(), tickets: seedTickets() };
    await save(db);
    return db;
  }
}

async function save(db: Db) {
  const file = dbPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, file); // atomic: readers never see a half-written file
}

const stats = (e: EventRow, tickets: TicketRow[]): EventWithStats => {
  let taken = 0, listed = 0;
  for (const t of tickets) {
    if (t.event_id !== e.id) continue;
    if (t.status === 'valid' || t.status === 'used') taken++;
    else if (t.status === 'listed') listed++;
  }
  return { ...e, remaining: Math.max(e.capacity - taken, 0), listed };
};

export const localStore: Store = {
  async listEvents(query) {
    const db = await load();
    const q = query?.trim().toLowerCase();
    const now = Date.now();
    return db.events
      .filter((e) => new Date(e.starts_at).getTime() > now)
      .filter((e) => !q || [e.title, e.artist, e.venue, e.city, e.genre].some((f) => f.toLowerCase().includes(q)))
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .map((e) => stats(e, db.tickets));
  },

  async getEvent(id) {
    const db = await load();
    const e = db.events.find((x) => x.id === id);
    return e ? stats(e, db.tickets) : null;
  },

  async getTicket(token) {
    const db = await load();
    return db.tickets.find((t) => t.token === token) ?? null;
  },

  purchase(input: PurchaseInput): Promise<PurchaseResult> {
    return withLock(async () => {
      const db = await load();
      const event = db.events.find((e) => e.id === input.eventId);
      if (!event) throw new StoreError('event_not_found');

      const held = db.tickets.filter(
        (t) => t.event_id === event.id && t.phone === input.phone && (t.status === 'valid' || t.status === 'used'),
      ).length;
      if (held >= MAX_TICKETS_PER_PHONE) throw new StoreError('limit_reached');

      const oldestListed = db.tickets
        .filter((t) => t.event_id === event.id && t.status === 'listed')
        .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))[0];

      if (oldestListed) {
        // Same row, new identity: the seller's old token stops existing immediately.
        oldestListed.token = newToken();
        oldestListed.phone = input.phone;
        oldestListed.holder_name = input.name;
        oldestListed.status = 'valid';
        await save(db);
        return { ticket: { ...oldestListed }, resold: true };
      }

      if (stats(event, db.tickets).remaining <= 0) throw new StoreError('sold_out');

      const ticket: TicketRow = {
        id: newId(), event_id: event.id, token: newToken(), phone: input.phone,
        holder_name: input.name, status: 'valid', created_at: new Date().toISOString(),
      };
      db.tickets.push(ticket);
      await save(db);
      return { ticket, resold: false };
    });
  },

  listTicket(token) {
    return withLock(async () => {
      const db = await load();
      const t = db.tickets.find((x) => x.token === token);
      if (!t) throw new StoreError('ticket_not_found');
      const event = db.events.find((e) => e.id === t.event_id);
      if (t.status !== 'valid' || !event || new Date(event.starts_at).getTime() <= Date.now()) {
        throw new StoreError('invalid_state');
      }
      t.status = 'listed';
      await save(db);
      return { ...t };
    });
  },

  cancelListing(token) {
    return withLock(async () => {
      const db = await load();
      const t = db.tickets.find((x) => x.token === token);
      if (!t) throw new StoreError('ticket_not_found');
      if (t.status !== 'listed') throw new StoreError('invalid_state');
      t.status = 'valid';
      await save(db);
      return { ...t };
    });
  },
};
