# re·roll

A fan-to-fan ticket marketplace. Fans who can't go list their ticket (for example a Dice ticket) at a **capped** price; buyers pay into **escrow**; the seller delivers; Re-Roll releases the money and keeps a cut.

Re-Roll is independent of Dice and event organizers. Ticket issuers may not permit resale and can cancel resold tickets, so the product states this on every sell/buy page. Check the resale laws where you operate before launching.

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

No setup needed: data lives in `.data/db.json` (created and seeded with 6 events and a few demo listings on first run; delete it to reset). SMS messages print to the server console. **Payments are simulated** (see TODO).

Copy `.env.example` to `.env.local` to configure:

| Variable | Effect |
| --- | --- |
| `MAX_MARKUP_PCT` (150) | Max asking price as % of face value |
| `PLATFORM_FEE_PCT` (10) | Re-Roll's cut, deducted from the seller's payout |
| `RESERVE_MINUTES` (15) | How long a buyer has to pay after reserving |
| `CRON_SECRET`, `ADMIN_SECRET` | Enable the operator endpoints below (disabled while unset) |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Use Supabase instead of the local file; run `supabase/schema.sql` first (it drops the old `tickets` table) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | Send real SMS |
| `APP_URL`, `APP_TIMEZONE` | SMS link base URL; display timezone |

## How a sale works

1. **List** (`/sell`): seller picks an event, enters the face value they paid, an asking price (≤ cap), their Dice order reference (private, for disputes), and confirms ownership. They get a private seller link by SMS.
2. **Reserve** (`/l/[id]`): a buyer reserves the listing. The claim is atomic, so only one buyer wins. The reservation lapses after `RESERVE_MINUTES` and the listing goes back on sale.
3. **Pay** (`/o/[token]`): the buyer's payment goes into escrow. Seller is texted.
4. **Deliver** (`/s/[token]`): the seller delivers the ticket outside Re-Roll and marks it delivered with a note. Buyer is texted.
5. **Release**: buyer confirms, and the seller is paid `price − fee`. Or `POST /api/cron/settle` releases delivered orders 24h after the event, and refunds paid-but-undelivered orders once the event starts.
6. **Problems**: the buyer can report a problem (freezes the payment); the seller can refund a sale they can't deliver; the operator resolves disputes with `POST /api/admin/orders/<id> {action: 'release' | 'refund'}` (Bearer `ADMIN_SECRET`).

Order states: `pending_payment → escrowed → delivered → released`, plus `disputed`, `refunded`, `expired`. Listing states: `active`, `reserved`, `sold`, `cancelled`.

The `Store` interface is in `lib/types.ts`; implementations are `lib/store/local.ts` (writes serialized through one in-process queue, atomic file rename) and `lib/store/supabase.ts` (conditional updates `where status = ...` plus a unique index allowing one live order per listing). Payments sit behind `lib/payments.ts`.

## Tests

```bash
rm -rf .data && npm run build && npm start &   # in another shell:
node tools/e2e.mjs http://localhost:3000
```

Covers the price cap, simultaneous-reservation race, escrow → delivery → release, refund, dispute, cancel and auth on operator endpoints.

## Site audit tool

```bash
node tools/audit.mjs http://localhost:3000 --crawl 6 --out audit-out --delay 1000
```

`playwright-core` (set `CHROMIUM_PATH` if needed). Reads `robots.txt`, skips disallowed paths, uses an honest user-agent, waits `--delay` ms between requests, follows same-origin links up to `--crawl` pages, and saves mobile (390×844) and desktop (1280×800) screenshots, `outline.json` per page and `features.md`. Public pages only: no logins, no form submission, no private APIs.

## TODO

- [ ] **Real payments**: Stripe adapter in `lib/payments.ts` (hold funds at payment, pay out `payout_cents` on release, refund on refund). Today `payments` is a demo that only logs.
- [ ] Phone-code login (sellers and buyers are identified only by phone number plus private links)
- [ ] Ticket proof upload (screenshot) and verification; today proof is a free-text note
- [ ] Operator dashboard for disputes (currently an authenticated endpoint; order ids are in the dispute log)
- [ ] Organizer-submitted events / official event feeds (events are seeded sample data)
- [ ] Scheduled job to call `/api/cron/settle`
- [ ] Rate limiting and abuse controls on listing and reservation endpoints
- [ ] Door scanner, sold-out waitlist
