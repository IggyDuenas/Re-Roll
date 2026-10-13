# re·roll

A fan-to-fan ticket marketplace. Fans who can't go list their ticket (for example a Dice ticket) at a **capped** price; buyers pay into **escrow**; the seller delivers; Re-Roll releases the money and keeps a cut.

Re-Roll is independent of Dice and event organizers. Ticket issuers may not permit resale and can cancel resold tickets, so the product states this on every sell/buy page. Check the resale laws where you operate before launching.

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

No setup needed: data lives in `.data/db.json` (created and seeded with 6 events and a few demo listings on first run; delete it to reset). SMS messages print to the server console. **Without `STRIPE_SECRET_KEY`, payments are simulated** and no money moves; see [Stripe escrow](#stripe-escrow).

Copy `.env.example` to `.env.local` to configure:

| Variable | Effect |
| --- | --- |
| `MAX_MARKUP_PCT` (150) | Max asking price as % of face value |
| `PLATFORM_FEE_PCT` (10) | Re-Roll's cut, deducted from the seller's payout |
| `RESERVE_MINUTES` (15) | How long a buyer has to pay after reserving |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Turn on real Stripe escrow (below) |
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

## Deploy to Vercel

The local JSON store can't persist on Vercel, so the app refuses to start there without Supabase.

1. Create a Supabase project and run `supabase/schema.sql` in its SQL editor.
2. In Vercel: **Add New → Project → import the GitHub repo** (Framework: Next.js; no other build settings).
3. Add environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API keys, server-side only), `APP_URL` (your production URL), `CRON_SECRET`, `ADMIN_SECRET` (long random strings, e.g. `openssl rand -hex 24`), plus the Stripe and Twilio variables when ready.
4. Deploy. Schedule `POST /api/cron/settle` with `Authorization: Bearer $CRON_SECRET` (for example a Vercel Cron job or any scheduler).

## Stripe escrow

Set `STRIPE_SECRET_KEY` (start with an `sk_test_` key) and `STRIPE_WEBHOOK_SECRET` to switch from demo payments to Stripe. It uses **Connect with separate charges and transfers**:

| Step | What happens |
| --- | --- |
| Seller onboarding | After listing, the seller clicks *Set up payouts* on their seller page → a Stripe **Express** account is created and they complete Stripe's onboarding. The listing is hidden from buyers (and can't be reserved) until the account can receive payouts. |
| Hold | The buyer pays via **Stripe Checkout**. The charge is captured immediately into **your platform balance**, which is the escrow. (Card authorizations expire after ~7 days and events are further out, so we don't use manual capture.) The order becomes `escrowed` only when the signed `checkout.session.completed` webhook arrives. |
| Release | Buyer confirms (or `/api/cron/settle` auto-releases 24h after the event) → a **Transfer** of `price − fee` to the seller's account, tied to the original charge. The fee simply stays in your balance. |
| Refund | Seller can't deliver / event starts undelivered / operator resolves a dispute for the buyer → **Refund** on the PaymentIntent. Stripe doesn't return its processing fee, so refunds cost you that fee. |

Setup: create a webhook endpoint at `https://<your-domain>/api/webhooks/stripe` for `checkout.session.completed` and `account.updated`, and enable **Connect** on your Stripe account. For local dev: `stripe listen --forward-to localhost:3000/api/webhooks/stripe` prints the `whsec_...` to use.

Safety properties (all covered by `npm run test:stripe`): webhook signatures are verified on the raw body; handlers are idempotent; money-moving calls use idempotency keys derived from the order id; a payment that can't become an escrowed order (reservation lapsed, duplicate payment, wrong amount) is refunded automatically; a payout or refund that fails is recorded as unsettled and retried by the cron.

Notes: sellers are US individuals (`country: US`); amounts are USD. Stripe's Terms for Connect/marketplaces and your resale-law obligations still apply: confirm with Stripe that this use case is allowed on your account before going live.

## Tests

```bash
npm run build
npm run test:stripe        # offline: fake Stripe API + the app in Stripe mode (isolated data file)
```

`test:stripe` checks Re-Roll's integration against a local **fake** of the Stripe endpoints we call (`tools/fake-stripe.mjs`). It cannot prove real-Stripe behavior (declines, Connect onboarding rules, balance availability); do a test-mode run with real `sk_test_` keys before launch.

Demo-mode flow:


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

- [ ] Verify the Stripe adapter in test mode with real keys, then live; handle chargebacks (`charge.dispute.created`) and Connect payout failures
- [ ] Phone-code login (sellers and buyers are identified only by phone number plus private links)
- [ ] Ticket proof upload (screenshot) and verification; today proof is a free-text note
- [ ] Operator dashboard for disputes (currently an authenticated endpoint; order ids are in the dispute log)
- [ ] Organizer-submitted events / official event feeds (events are seeded sample data)
- [ ] Scheduled job to call `/api/cron/settle`
- [ ] Rate limiting and abuse controls on listing and reservation endpoints
- [ ] Door scanner, sold-out waitlist
