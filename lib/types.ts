export type TicketStatus = 'valid' | 'listed' | 'returned' | 'used';

export interface EventRow {
  id: string;
  title: string;
  artist: string;
  venue: string;
  city: string;
  starts_at: string; // ISO timestamp
  price_cents: number;
  capacity: number;
  description: string;
  genre: string;
}

export interface TicketRow {
  id: string;
  event_id: string;
  token: string;
  phone: string; // E.164
  holder_name: string | null;
  status: TicketStatus;
  created_at: string;
}

export interface EventWithStats extends EventRow {
  /** capacity - tickets with status valid or used. Listed tickets count as available. */
  remaining: number;
  /** tickets currently re-rolled and back on sale at face value */
  listed: number;
}

export interface PurchaseInput {
  eventId: string;
  phone: string; // already normalized
  name: string | null;
}

export interface PurchaseResult {
  ticket: TicketRow;
  /** true when the buyer received a re-rolled ticket instead of a fresh one */
  resold: boolean;
}

export type StoreErrorCode = 'event_not_found' | 'ticket_not_found' | 'sold_out' | 'limit_reached' | 'invalid_state';

export class StoreError extends Error {
  constructor(public code: StoreErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'StoreError';
  }
}

export const MAX_TICKETS_PER_PHONE = 4;

export interface Store {
  /** Upcoming events, optionally filtered by search text (title, artist, venue, city, genre). */
  listEvents(query?: string): Promise<EventWithStats[]>;
  getEvent(id: string): Promise<EventWithStats | null>;
  getTicket(token: string): Promise<TicketRow | null>;
  /**
   * Sells one ticket. Hands out the OLDEST listed ticket if any exist (rotating its token so the
   * seller's old link dies), otherwise creates a new one. Throws StoreError.
   */
  purchase(input: PurchaseInput): Promise<PurchaseResult>;
  /** valid -> listed (future events only). Throws ticket_not_found / invalid_state. */
  listTicket(token: string): Promise<TicketRow>;
  /** listed -> valid. Throws ticket_not_found / invalid_state. */
  cancelListing(token: string): Promise<TicketRow>;
}
