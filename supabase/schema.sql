-- Re-Roll schema. Run in the Supabase SQL editor. The app talks to Supabase with the
-- service-role key from the server only; RLS is enabled with no policies so the anon key can't read tickets.

create extension if not exists pgcrypto;

create table if not exists events (
  id           text primary key,
  title        text not null,
  artist       text not null,
  venue        text not null,
  city         text not null,
  starts_at    timestamptz not null,
  price_cents  integer not null check (price_cents >= 0),
  capacity     integer not null check (capacity > 0),
  description  text not null default '',
  genre        text not null default ''
);

create table if not exists tickets (
  id           uuid primary key default gen_random_uuid(),
  event_id     text not null references events(id) on delete cascade,
  token        text not null unique,
  phone        text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  holder_name  text,
  status       text not null default 'valid' check (status in ('valid', 'listed', 'returned', 'used')),
  created_at   timestamptz not null default now()
);

create index if not exists tickets_event_status_idx on tickets (event_id, status, created_at);
create index if not exists tickets_event_phone_idx  on tickets (event_id, phone);

alter table events  enable row level security;
alter table tickets enable row level security;

-- Sample data (optional)
insert into events (id, title, artist, venue, city, starts_at, price_cents, capacity, description, genre) values
  ('neon-tides-warehouse', 'Neon Tides', 'Neon Tides', 'Pier 9 Warehouse', 'Brooklyn', now() + interval '9 days', 3500, 400, 'Seven hours of synth-heavy dance floor in a converted shipping warehouse.', 'Electronic'),
  ('marlow-june-hall', 'Marlow June: Quiet Hours Tour', 'Marlow June', 'The Gilded Hall', 'Chicago', now() + interval '16 days', 4800, 220, 'An intimate, seated evening of hushed songwriting.', 'Indie Folk'),
  ('low-orbit-club', 'Low Orbit: Release Party', 'Low Orbit', 'Basement 44', 'Austin', now() + interval '5 days', 1800, 6, 'Tiny room, loud amps.', 'Post-punk'),
  ('sol-y-sombra', 'Sol y Sombra Night', 'Sol y Sombra', 'Teatro Alba', 'Los Angeles', now() + interval '23 days', 5500, 600, 'Full-band cumbia and bolero revival.', 'Latin'),
  ('the-velvet-drive', 'The Velvet Drive', 'The Velvet Drive', 'Rustbelt Ballroom', 'Detroit', now() + interval '12 days', 2800, 350, 'Garage-soul heavyweights return.', 'Rock'),
  ('kaito-after-dark', 'Kaito: After Dark', 'DJ Kaito', 'Halcyon Rooftop', 'Miami', now() + interval '30 days', 6500, 300, 'Sunset-to-sunrise house session over the bay.', 'House')
on conflict (id) do nothing;
