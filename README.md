# re·roll

Face-value ticket resale, a play on Dice. Buy tickets to live events. Can't go? **Re-roll** the ticket: it goes back on sale at face value and moves to the next buyer. There is no way to set a price, so a markup is impossible.

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

No setup needed. Data lives in `.data/db.json` (created and seeded with 6 events on first run; delete it to reset). Tickets are "texted" by printing the link to the server console, and the buy form also shows the link in dev.

Copy `.env.example` to `.env.local` to configure:

| Variable | Effect |
| --- | --- |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Use Supabase instead of the local file. Run `supabase/schema.sql` first. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | Send real SMS. Otherwise the link is logged. |
| `APP_URL` | Base URL used in SMS links (default: request origin). |
| `APP_TIMEZONE` | Display timezone for event times (default `America/New_York`). |

## How it works

- `remaining = capacity − tickets(valid | used)`. Listed tickets count as available.
- **Buy** (`POST /api/tickets {eventId, phone, name}`): phone is normalized to E.164 (10 digits → `+1`), max 4 per phone per event, `409` if sold out. If any ticket is listed, the buyer gets the **oldest** one: same row, **new token**, new phone/name, status `valid`. The seller's old link and QR die instantly (404). Otherwise a new ticket is created.
- **Re-roll** (`POST /api/tickets/[token]/reroll {action: 'list' | 'cancel'}`): `list` only for a valid ticket on a future event; `cancel` only for a still-listed ticket. `404` if the token no longer exists, `409` for other invalid states.
- Local store serializes every write through a single in-process queue (read-modify-write with an atomic file rename), so concurrent requests can't oversell. Verified: 10 parallel buys for 2 remaining spots gave 2 × `201` and 8 × `409`.
- Supabase store claims listed tickets with a conditional update (`where status = 'listed'`).
- Data layer is the `Store` interface in `lib/types.ts`; implementations are in `lib/store/`.

## Site audit tool

```bash
node tools/audit.mjs http://localhost:3000 --crawl 6 --out audit-out --delay 1000
```

Uses `playwright-core` (point `CHROMIUM_PATH` at a Chromium binary if needed). Reads `robots.txt` and skips disallowed paths, identifies itself honestly in the user-agent, waits `--delay` ms between requests, and follows same-origin links up to `--crawl` pages. Per page it saves `mobile.png` (390×844) and `desktop.png` (1280×800) full-page screenshots and `outline.json`; `features.md` summarizes the crawl. Public pages only: no logins, no form submission, no private APIs.

## TODO (not in the MVP)

- [ ] Stripe payments, with a refund to the seller when their re-rolled ticket sells
- [ ] Phone-code (SMS OTP) login so holders can see all their tickets
- [ ] Door scanner that marks tickets `used`
- [ ] Organizer dashboard
- [ ] Sold-out waitlist
- [ ] Postgres row lock (or RPC) for the primary-sale capacity race in the Supabase store (re-roll claims are already atomic)
