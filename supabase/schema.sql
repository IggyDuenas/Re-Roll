-- Re-Roll marketplace schema. Run in the Supabase SQL editor.
-- The app talks to Supabase with the service-role key from the server only; RLS is enabled with no
-- policies so the anon key can read nothing.

create extension if not exists pgcrypto;

create table if not exists events (
  id           text primary key,
  title        text not null,
  artist       text not null,
  venue        text not null,
  city         text not null,
  starts_at    timestamptz not null,
  price_cents  integer not null check (price_cents >= 0),  -- typical face value, reference only
  description  text not null default '',
  genre        text not null default '',
  image_url    text,
  source_url   text,
  external_id  text
);
alter table events add column if not exists image_url   text;
alter table events add column if not exists source_url  text;
alter table events add column if not exists external_id text;

create table if not exists listings (
  id                uuid primary key default gen_random_uuid(),
  event_id          text not null references events(id) on delete cascade,
  seller_token      text not null unique,
  seller_phone      text not null check (seller_phone ~ '^\+[1-9][0-9]{7,14}$'),
  seller_name       text,
  face_value_cents  integer not null check (face_value_cents > 0),
  price_cents       integer not null check (price_cents > 0),
  proof_note        text not null default '',
  status            text not null default 'active' check (status in ('active', 'reserved', 'sold', 'cancelled')),
  created_at        timestamptz not null default now()
);
-- Stripe Connect (seller payouts). Existing databases: these ALTERs add the new columns.
alter table listings add column if not exists stripe_account_id text;
alter table listings add column if not exists payouts_ready boolean not null default false;
-- (payouts_ready is only consulted when STRIPE_SECRET_KEY is set)
create index if not exists listings_event_status_idx on listings (event_id, status, price_cents);

create table if not exists orders (
  id              uuid primary key default gen_random_uuid(),
  listing_id      uuid not null references listings(id) on delete cascade,
  event_id        text not null references events(id) on delete cascade,
  buyer_token     text not null unique,
  buyer_phone     text not null check (buyer_phone ~ '^\+[1-9][0-9]{7,14}$'),
  buyer_name      text,
  price_cents     integer not null,
  fee_cents       integer not null,
  payout_cents    integer not null,
  status          text not null default 'pending_payment'
                  check (status in ('pending_payment', 'escrowed', 'delivered', 'released', 'disputed', 'refunded', 'expired')),
  delivery_note   text,
  dispute_reason  text,
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now(),
  paid_at         timestamptz,
  delivered_at    timestamptz,
  closed_at       timestamptz
);
alter table orders add column if not exists payment_ref text;     -- Stripe PaymentIntent id
alter table orders add column if not exists settlement_ref text;  -- Stripe Transfer / Refund id
create index if not exists orders_pending_settlement_idx on orders (status) where payment_ref is not null and settlement_ref is null;
create index if not exists orders_listing_idx on orders (listing_id, status);
-- At most one live (non-expired) order per listing: a second concurrent reservation fails here.
create unique index if not exists orders_one_live_per_listing on orders (listing_id) where status <> 'expired';

alter table events   enable row level security;
alter table listings enable row level security;
alter table orders   enable row level security;

insert into events (id, title, artist, venue, city, starts_at, price_cents, description, genre) values
  ('neon-tides-warehouse', 'Neon Tides', 'Neon Tides', 'Pier 9 Warehouse', 'Brooklyn', now() + interval '9 days', 3500, 'Seven hours of synth-heavy dance floor in a converted shipping warehouse.', 'Electronic'),
  ('marlow-june-hall', 'Marlow June: Quiet Hours Tour', 'Marlow June', 'The Gilded Hall', 'Chicago', now() + interval '16 days', 4800, 'An intimate, seated evening of hushed songwriting.', 'Indie Folk'),
  ('low-orbit-club', 'Low Orbit: Release Party', 'Low Orbit', 'Basement 44', 'Austin', now() + interval '5 days', 1800, 'Tiny room, loud amps.', 'Post-punk'),
  ('sol-y-sombra', 'Sol y Sombra Night', 'Sol y Sombra', 'Teatro Alba', 'Los Angeles', now() + interval '23 days', 5500, 'Full-band cumbia and bolero revival.', 'Latin'),
  ('the-velvet-drive', 'The Velvet Drive', 'The Velvet Drive', 'Rustbelt Ballroom', 'Detroit', now() + interval '12 days', 2800, 'Garage-soul heavyweights return.', 'Rock'),
  ('kaito-after-dark', 'Kaito: After Dark', 'DJ Kaito', 'Halcyon Rooftop', 'Miami', now() + interval '30 days', 6500, 'Sunset-to-sunrise house session over the bay.', 'House')
on conflict (id) do nothing;
