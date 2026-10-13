export type ListingStatus = 'active' | 'reserved' | 'sold' | 'cancelled';
export type OrderStatus = 'pending_payment' | 'escrowed' | 'delivered' | 'released' | 'disputed' | 'refunded' | 'expired';

export interface EventRow {
  id: string;
  title: string;
  artist: string;
  venue: string;
  city: string;
  starts_at: string; // ISO
  price_cents: number; // typical face value, for reference
  description: string;
  genre: string;
  /** set for events imported from an external feed */
  image_url?: string | null;
  source_url?: string | null;
  external_id?: string | null;
}

export interface EventWithStats extends EventRow {
  activeListings: number;
  /** cheapest active asking price, null when none */
  fromPriceCents: number | null;
}

export interface ListingRow {
  id: string;
  event_id: string;
  seller_token: string; // unguessable, grants access to the seller page
  seller_phone: string; // E.164
  seller_name: string | null;
  face_value_cents: number;
  price_cents: number;
  proof_note: string; // Dice order reference / details the seller provided
  stripe_account_id: string | null; // seller's Stripe Connect Express account (Stripe mode)
  payouts_ready: boolean; // seller finished payout onboarding; required to be buyable in Stripe mode
  status: ListingStatus;
  created_at: string;
}
/** What the public may see. */
export type PublicListing = Omit<ListingRow, 'seller_token' | 'seller_phone' | 'proof_note' | 'stripe_account_id'>;

export interface OrderRow {
  id: string;
  listing_id: string;
  event_id: string;
  buyer_token: string; // unguessable, grants access to the order page
  buyer_phone: string;
  buyer_name: string | null;
  price_cents: number;
  fee_cents: number;
  payout_cents: number;
  status: OrderStatus;
  payment_ref: string | null; // Stripe PaymentIntent id once paid (null in demo mode)
  settlement_ref: string | null; // Stripe Transfer (released) or Refund (refunded) id once money has moved
  delivery_note: string | null;
  dispute_reason: string | null;
  expires_at: string;
  created_at: string;
  paid_at: string | null;
  delivered_at: string | null;
  closed_at: string | null;
}

export interface OrderView { order: OrderRow; listing: PublicListing; event: EventRow; sellerPhone: string }
export interface SellerView { listing: ListingRow; order: OrderRow | null; event: EventRow }

export type StoreErrorCode = 'event_not_found' | 'listing_not_found' | 'order_not_found' | 'invalid_state' | 'own_listing';

export class StoreError extends Error {
  constructor(public code: StoreErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'StoreError';
  }
}

export interface CreateListingInput {
  eventId: string;
  sellerPhone: string;
  sellerName: string | null;
  faceValueCents: number;
  priceCents: number;
  proofNote: string;
}

export interface Store {
  listEvents(query?: string): Promise<EventWithStats[]>;
  getEvent(id: string): Promise<EventWithStats | null>;
  /** Insert or update events by id (used by the feed importer). */
  upsertEvents(events: EventRow[]): Promise<number>;
  /** Delete the given events, but only those that have no listings. Returns how many were removed. */
  deleteEventsWithoutListings(ids: string[]): Promise<number>;
  listActiveListings(eventId: string): Promise<PublicListing[]>;
  getListing(id: string): Promise<PublicListing | null>;

  createListing(input: CreateListingInput): Promise<ListingRow>;
  getSellerView(sellerToken: string): Promise<SellerView | null>;
  /** active -> cancelled */
  cancelListing(sellerToken: string): Promise<ListingRow>;

  /** Atomically claims an active listing (active -> reserved) and opens a pending order. */
  reserve(listingId: string, buyer: { phone: string; name: string | null }): Promise<OrderRow>;
  getOrderView(buyerToken: string): Promise<OrderView | null>;
  /** Server-only: seller's phone + manage token, for notifications. Never expose to clients. */
  getSellerContact(listingId: string): Promise<{ phone: string; token: string; stripeAccountId: string | null } | null>;
  /** Server-only lookup by id (webhooks). */
  getOrderById(orderId: string): Promise<OrderRow | null>;
  /**
   * pending_payment -> escrowed (listing -> sold). Call after funds are captured into escrow.
   * Idempotent: repeating with the same paymentRef on an already-paid order returns it unchanged.
   */
  markPaidById(orderId: string, paymentRef: string | null): Promise<OrderRow>;
  /** Stripe mode: remember the seller's connected account (created at payout setup). */
  setSellerAccount(sellerToken: string, accountId: string): Promise<void>;
  /** Stripe mode: flip payouts_ready for every listing on that connected account. */
  setPayoutsReady(accountId: string, ready: boolean): Promise<void>;
  /** Record the Transfer/Refund id once money has actually moved. */
  setSettlementRef(orderId: string, ref: string): Promise<void>;
  /** Released/refunded orders that were paid through Stripe but whose payout/refund hasn't been recorded (retry queue). */
  listPendingSettlements(): Promise<OrderRow[]>;
  /** escrowed -> delivered */
  markDelivered(sellerToken: string, note: string): Promise<OrderRow>;
  /** delivered -> released (seller gets paid) */
  confirmReceived(buyerToken: string): Promise<OrderRow>;
  /** escrowed | delivered -> disputed */
  openDispute(buyerToken: string, reason: string): Promise<OrderRow>;
  /** escrowed -> refunded: seller cannot deliver */
  sellerRefund(sellerToken: string): Promise<OrderRow>;
  /** disputed -> released | refunded (operator decision) */
  resolveDispute(orderId: string, outcome: 'release' | 'refund'): Promise<OrderRow>;
  /** Sweep: delivered orders past the release window -> released; undelivered paid orders for started events -> refunded. */
  settleDue(): Promise<{ released: OrderRow[]; refunded: OrderRow[] }>;
}
