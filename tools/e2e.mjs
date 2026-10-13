#!/usr/bin/env node
// End-to-end check of the marketplace against a running server: node tools/e2e.mjs [baseUrl]
// Run against a fresh .data/ (the script creates its own listings).
const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) failures++; };
const post = async (path, body, headers = {}) => {
  const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
const get = async (path) => { const res = await fetch(base + path, { redirect: 'manual' }); return { status: res.status, html: await res.text() }; };
const tok = (link) => link.split('/').pop();

const EVENT = 'neon-tides-warehouse'; // face-value reference $35

// --- seller validation
let r = await post('/api/listings', { eventId: EVENT, phone: '5552345678', faceValueCents: 3500, priceCents: 5300, proofNote: 'Dice #A1', confirmOwnership: true });
check('price above 150% cap is rejected', r.status === 400 && r.data.code === 'bad_price', r.data.error);
r = await post('/api/listings', { eventId: EVENT, phone: '5552345678', faceValueCents: 3500, priceCents: 5000, proofNote: 'Dice #A1' });
check('listing without ownership confirmation is rejected', r.status === 400);

// --- seller lists at 1.43x face
r = await post('/api/listings', { eventId: EVENT, phone: '5552345678', name: 'Alice', faceValueCents: 3500, priceCents: 5000, proofNote: 'Dice #A1', confirmOwnership: true });
check('seller lists ticket at $50 on $35 face', r.status === 201 && r.data.devLink, JSON.stringify(r.data));
const sellerLink = r.data.devLink, sellerTok = tok(sellerLink), listingId = r.data.listingId;
check('seller page loads', (await get(`/s/${sellerTok}`)).status === 200);
check('listing visible on event page at $50', (await get(`/events/${EVENT}`)).html.includes('$50'));

// --- buyer reserves; second buyer is blocked
r = await post(`/api/listings/${listingId}/reserve`, { phone: '5552345678' });
check("seller can't buy own listing", r.status === 409, r.data.code);
const [a, b] = await Promise.all([
  post(`/api/listings/${listingId}/reserve`, { phone: '5559876543', name: 'Bob' }),
  post(`/api/listings/${listingId}/reserve`, { phone: '5552223333', name: 'Carol' }),
]);
check('two simultaneous buyers: exactly one reserves', [a.status, b.status].sort().join() === '201,409', `${a.status},${b.status}`);
const winner = a.status === 201 ? a : b;
const orderTok = winner.data.orderToken;
check('listing no longer public while reserved', !(await get(`/events/${EVENT}`)).html.includes(`/l/${listingId}`));

// --- pay into escrow, seller delivers, buyer confirms
r = await post(`/api/orders/${orderTok}`, { action: 'confirm' });
check('cannot confirm before delivery', r.status === 409);
r = await post(`/api/orders/${orderTok}`, { action: 'pay' });
check('buyer pays into escrow', r.status === 200 && r.data.status === 'escrowed');
r = await post(`/api/orders/${orderTok}`, { action: 'pay' });
check('double payment rejected', r.status === 409);
r = await post(`/api/sell/${sellerTok}`, { action: 'cancel' });
check('seller cannot cancel after sale', r.status === 409);
r = await post(`/api/sell/${sellerTok}`, { action: 'deliver', note: 'Transferred via screenshot + door name' });
check('seller marks delivered', r.status === 200 && r.data.status === 'delivered');
r = await post(`/api/orders/${orderTok}`, { action: 'confirm' });
check('buyer confirms: payment released', r.status === 200 && r.data.status === 'released');
const sellerPage = (await get(`/s/${sellerTok}`)).html;
check('seller payout = $50 less 10% fee = $45', sellerPage.includes('$45'));

// --- refund path: seller can't deliver
r = await post('/api/listings', { eventId: EVENT, phone: '5552345678', faceValueCents: 3500, priceCents: 3500, proofNote: 'Dice #A2', confirmOwnership: true });
const s2 = tok(r.data.devLink), l2 = r.data.listingId;
const o2 = (await post(`/api/listings/${l2}/reserve`, { phone: '5559876543' })).data.orderToken;
await post(`/api/orders/${o2}`, { action: 'pay' });
r = await post(`/api/sell/${s2}`, { action: 'refund' });
check('seller refund before delivery', r.status === 200 && r.data.status === 'refunded');

// --- dispute path + admin
r = await post('/api/listings', { eventId: EVENT, phone: '5552345678', faceValueCents: 3500, priceCents: 4000, proofNote: 'Dice #A3', confirmOwnership: true });
const s3 = tok(r.data.devLink), l3 = r.data.listingId;
const o3 = (await post(`/api/listings/${l3}/reserve`, { phone: '5559876543' })).data.orderToken;
await post(`/api/orders/${o3}`, { action: 'pay' });
await post(`/api/sell/${s3}`, { action: 'deliver', note: 'sent a screenshot' });
r = await post(`/api/orders/${o3}`, { action: 'dispute', reason: 'QR code was already scanned' });
check('buyer disputes', r.status === 200 && r.data.status === 'disputed');
r = await post(`/api/orders/${o3}`, { action: 'confirm' });
check('cannot confirm a disputed order', r.status === 409);
r = await post('/api/cron/settle', {});
check('cron endpoint rejects missing auth', r.status === 401);
r = await post('/api/admin/orders/00000000-0000-0000-0000-000000000000', { action: 'refund' }, { authorization: 'Bearer wrong' });
check('admin endpoint rejects bad auth', r.status === 401);
// --- cancel path & old-state pages
r = await post('/api/listings', { eventId: EVENT, phone: '5552345678', faceValueCents: 3500, priceCents: 3500, proofNote: 'Dice #A4', confirmOwnership: true });
const s4 = tok(r.data.devLink);
r = await post(`/api/sell/${s4}`, { action: 'cancel' });
check('seller can take down an unsold listing', r.status === 200 && r.data.status === 'cancelled');
check('unknown order token is 404', (await get('/o/AAAAAAAAAAAAAAAAAAAAAAAA')).status === 404);

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
