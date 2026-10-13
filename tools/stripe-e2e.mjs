#!/usr/bin/env node
// Offline end-to-end test of the Stripe adapter: node tools/stripe-e2e.mjs   (needs `npm run build` first)
// Starts a fake Stripe API + the built app in Stripe mode (isolated .data file), then drives the whole
// marketplace flow. Verifies Re-Roll's integration; it does not replace a test-mode run against real Stripe.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startFakeStripe } from './fake-stripe.mjs';

const APP = 3210, FAKE = 12111, SECRET = 'whsec_test_secret';
const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'reroll-stripe-')), 'db.json');
const base = `http://localhost:${APP}`;
let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) failures++; };
const post = async (p, body, headers = {}) => { const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }); return { status: r.status, data: await r.json().catch(() => ({})) }; };
const get = async (p) => { const r = await fetch(base + p); return { status: r.status, html: await r.text() }; };
const ctl = async (p, body = {}) => (await fetch(`http://localhost:${FAKE}${p}`, { method: 'POST', body: JSON.stringify(body) })).json();
const db = () => JSON.parse(fs.readFileSync(dbFile, 'utf8'));
const tok = (l) => l.split('/').pop();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fake = await startFakeStripe({ port: FAKE, webhookUrl: `${base}/api/webhooks/stripe`, webhookSecret: SECRET });
const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(APP)], {
  env: { ...process.env, STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_API_BASE: fake.url, STRIPE_WEBHOOK_SECRET: SECRET,
    LOCAL_DB_PATH: dbFile, CRON_SECRET: 'cron', ADMIN_SECRET: 'admin', APP_URL: base },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let appLog = ''; app.stdout.on('data', (d) => (appLog += d)); app.stderr.on('data', (d) => (appLog += d));
for (let i = 0; i < 40; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(500); }

async function run() {
  const EVENT = 'neon-tides-warehouse';
  const mkListing = async (price, phone = '5552345678') =>
    (await post('/api/listings', { eventId: EVENT, phone, name: 'Alice', faceValueCents: 3500, priceCents: price, proofNote: 'Dice #A1', confirmOwnership: true })).data;
  const visible = async (id) => (await get(`/events/${EVENT}`)).html.includes(`/l/${id}`);

  // 1. Not buyable until the seller can be paid
  const L1 = await mkListing(5000); const s1 = tok(L1.devLink);
  check('seeded demo listings are absent in Stripe mode', !(await get(`/events/low-orbit-club`)).html.includes('/l/'));
  check('new listing is hidden until payouts are set up', !(await visible(L1.listingId)));
  let r = await post(`/api/listings/${L1.listingId}/reserve`, { phone: '5559876543' });
  check('reserving a listing whose seller has no payouts is rejected', r.status === 409);

  // 2. Seller onboarding: webhook path
  r = await post(`/api/sell/${s1}`, { action: 'payout_setup' });
  check('payout_setup returns a Stripe onboarding URL', r.status === 200 && /connect\.stripe\.test\/setup\/acct_/.test(r.data.redirect), r.data.redirect);
  const acct1 = r.data.redirect.split('/').pop();
  check('Express account requested with transfers capability', fake.state.accounts[acct1]?.type === 'express' && fake.state.accounts[acct1].capabilities.transfers === 'true');
  r = await post(`/api/sell/${s1}`, { action: 'payout_setup' });
  check('payout_setup is repeatable and reuses the same account', r.data.redirect.endsWith(acct1) && Object.keys(fake.state.accounts).length === 1);
  check('still hidden after onboarding started but not finished', !(await visible(L1.listingId)));
  r = await ctl('/_test/account-ready', { account: acct1, webhook: true });
  check('account.updated webhook accepted', r.webhook_status === 200);
  check('listing visible after account.updated', await visible(L1.listingId));

  // 3. Seller onboarding: return-page sync path (no webhook)
  const L2 = await mkListing(4000); const s2 = tok(L2.devLink);
  const acct2 = (await post(`/api/sell/${s2}`, { action: 'payout_setup' })).data.redirect.split('/').pop();
  await ctl('/_test/account-ready', { account: acct2, webhook: false });
  check('seller page sync flips payouts_ready without a webhook', (await get(`/s/${s2}?payouts=return`)).status === 200 && await visible(L2.listingId));

  // 4. Buyer pays through Checkout
  r = await post(`/api/listings/${L1.listingId}/reserve`, { phone: '5559876543', name: 'Bob' });
  const orderTok = r.data.orderToken; check('buyer reserves', r.status === 201);
  r = await post(`/api/orders/${orderTok}`, { action: 'pay' });
  check('pay returns a Stripe Checkout redirect', r.status === 200 && /checkout\.stripe\.test\/pay\/cs_test_/.test(r.data.redirect), r.data.redirect);
  const sess = fake.state.sessions[r.data.redirect.split('/').pop()];
  check('Checkout session: $50.00 USD with order metadata', sess.amount_total === 5000 && sess.currency === 'usd' && !!sess.metadata.order_id);
  check('Checkout expires_at >= 30 minutes (Stripe minimum)', sess.expires_at - Math.floor(Date.now() / 1000) >= 29 * 60);
  check('order not escrowed before the webhook', db().orders.find((o) => o.buyer_token === orderTok).status === 'pending_payment');
  check('bad webhook signature is rejected', (await ctl('/_test/raw-webhook', { type: 'checkout.session.completed', object: sess, badSignature: true })).webhook_status === 400);
  check('unsigned webhook is rejected', (await post('/api/webhooks/stripe', { type: 'x' })).status === 400);
  const paid = await ctl('/_test/complete', { session_id: sess.id });
  check('checkout.session.completed accepted', paid.webhook_status === 200);
  let order = db().orders.find((o) => o.buyer_token === orderTok);
  check('order is escrowed with the PaymentIntent recorded', order.status === 'escrowed' && order.payment_ref === paid.payment_intent);
  const replay = await fetch(`${base}/api/webhooks/stripe`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': paid.webhook.header }, body: paid.webhook.payload });
  check('replayed webhook is idempotent (200, no refund, still escrowed)', replay.status === 200 && fake.state.refunds.length === 0 && db().orders.find((o) => o.buyer_token === orderTok).status === 'escrowed');

  // 5. Deliver, confirm: transfer to the seller
  await post(`/api/sell/${s1}`, { action: 'deliver', note: 'Sent via email, door name Alice' });
  r = await post(`/api/orders/${orderTok}`, { action: 'confirm' });
  check('buyer confirms', r.status === 200 && r.data.status === 'released');
  const t = fake.state.transfers[0];
  check('transfer = payout ($45) to the seller account, tied to the charge', t && t.amount === 4500 && t.destination === acct1 && t.source_transaction === paid.charge && t.transfer_group === order.id, JSON.stringify(t));
  check('transfer id recorded as settlement_ref', db().orders.find((o) => o.buyer_token === orderTok).settlement_ref === t.id);

  // 6. Late/duplicate payments are refunded, not kept
  const L3 = await mkListing(4000); const s3 = tok(L3.devLink);
  const a3 = (await post(`/api/sell/${s3}`, { action: 'payout_setup' })).data.redirect.split('/').pop();
  await ctl('/_test/account-ready', { account: a3, webhook: true });
  const o3 = (await post(`/api/listings/${L3.listingId}/reserve`, { phone: '5559876543' })).data.orderToken;
  const sA = fake.state.sessions[(await post(`/api/orders/${o3}`, { action: 'pay' })).data.redirect.split('/').pop()];
  const sB = fake.state.sessions[(await post(`/api/orders/${o3}`, { action: 'pay' })).data.redirect.split('/').pop()];
  const pA = await ctl('/_test/complete', { session_id: sA.id });
  const pB = await ctl('/_test/complete', { session_id: sB.id });
  check('double payment: second payment refunded automatically', pB.webhook_status === 200 && fake.state.refunds.some((x) => x.payment_intent === pB.payment_intent) && !fake.state.refunds.some((x) => x.payment_intent === pA.payment_intent));

  // 7. Seller refund path
  r = await post(`/api/sell/${s3}`, { action: 'refund' });
  check('seller refund -> Stripe refund of the first payment', r.status === 200 && fake.state.refunds.some((x) => x.payment_intent === pA.payment_intent));
  const ord3 = db().orders.find((o) => o.buyer_token === o3);
  check('refund id recorded as settlement_ref', ord3.status === 'refunded' && /^re_/.test(ord3.settlement_ref));

  // 8. Amount mismatch is refunded
  const L4 = await mkListing(3500); const s4 = tok(L4.devLink);
  const a4 = (await post(`/api/sell/${s4}`, { action: 'payout_setup' })).data.redirect.split('/').pop();
  await ctl('/_test/account-ready', { account: a4, webhook: true });
  const o4 = (await post(`/api/listings/${L4.listingId}/reserve`, { phone: '5559876543' })).data.orderToken;
  const s4s = fake.state.sessions[(await post(`/api/orders/${o4}`, { action: 'pay' })).data.redirect.split('/').pop()];
  const p4 = await ctl('/_test/complete', { session_id: s4s.id, amount: 100 });
  check('amount mismatch: refunded and order NOT escrowed', fake.state.refunds.some((x) => x.payment_intent === p4.payment_intent) && db().orders.find((o) => o.buyer_token === o4).status === 'pending_payment');

  // 9. Payout failure is retried by cron, exactly once
  const L5 = await mkListing(4200); const s5 = tok(L5.devLink);
  const a5 = (await post(`/api/sell/${s5}`, { action: 'payout_setup' })).data.redirect.split('/').pop();
  await ctl('/_test/account-ready', { account: a5, webhook: true });
  const o5 = (await post(`/api/listings/${L5.listingId}/reserve`, { phone: '5559876543' })).data.orderToken;
  const s5s = fake.state.sessions[(await post(`/api/orders/${o5}`, { action: 'pay' })).data.redirect.split('/').pop()];
  await ctl('/_test/complete', { session_id: s5s.id });
  await post(`/api/sell/${s5}`, { action: 'deliver', note: 'sent the tickets over' });
  const before = fake.state.transfers.length;
  await ctl('/_test/fail-next-transfer');
  r = await post(`/api/orders/${o5}`, { action: 'confirm' });
  let ord5 = db().orders.find((x) => x.buyer_token === o5);
  check('payout failure: order is released but unsettled (no settlement_ref)', r.status === 200 && ord5.status === 'released' && !ord5.settlement_ref && fake.state.transfers.length === before);
  r = await post('/api/cron/settle', {}, { authorization: 'Bearer cron' });
  ord5 = db().orders.find((x) => x.buyer_token === o5);
  check('cron retries the payout and records it', r.data.retried === 1 && /^tr_/.test(ord5.settlement_ref) && fake.state.transfers.length === before + 1, JSON.stringify(r.data));
  r = await post('/api/cron/settle', {}, { authorization: 'Bearer cron' });
  check('a further cron run does nothing more', r.data.retried === 0 && fake.state.transfers.length === before + 1);

  check('no unexpected errors in the app log', !/TypeError|Unhandled|ECONNREFUSED/.test(appLog), '');
}

try { await run(); } catch (e) { console.error(e); failures++; }
finally { app.kill(); await fake.close(); }
console.log(failures ? `\n${failures} check(s) FAILED\n--- app log tail ---\n${appLog.split('\n').slice(-25).join('\n')}` : '\nAll Stripe adapter checks passed');
process.exit(failures ? 1 : 0);
