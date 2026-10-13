// A tiny in-memory fake of the Stripe API endpoints Re-Roll uses, for offline tests of the Stripe adapter.
// It checks OUR wiring (requests we send, webhooks we handle, idempotency, retries). It is not Stripe:
// real-world behavior (card declines, onboarding rules, balance availability) needs a Stripe test-mode run.
import http from 'node:http';
import Stripe from 'stripe';

export async function startFakeStripe({ port, webhookUrl, webhookSecret }) {
  const st = { sessions: {}, accounts: {}, intents: {}, transfers: [], refunds: [], idem: {}, evt: 0, n: 0, failNextTransfer: false, requests: [] };
  const id = (p) => `${p}_${(++st.n).toString().padStart(4, '0')}`;

  async function sendWebhook(type, object) {
    const payload = JSON.stringify({ id: `evt_${++st.evt}`, object: 'event', type, data: { object } });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
    const res = await fetch(webhookUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': header }, body: payload });
    return { status: res.status, payload, header };
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    let raw = ''; for await (const c of req) raw += c;
    const form = Object.fromEntries(new URLSearchParams(raw));
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    const err = (code, c, message) => send(code, { error: { type: 'invalid_request_error', code: c, message } });
    st.requests.push(`${req.method} ${url.pathname}`);
    const idemKey = req.headers['idempotency-key'];
    const replay = idemKey && st.idem[idemKey];
    if (replay) return send(200, replay);
    const done = (body) => { if (idemKey) st.idem[idemKey] = body; send(200, body); };

    try {
      if (req.method === 'POST' && url.pathname === '/v1/checkout/sessions') {
        const s = {
          id: id('cs_test'), object: 'checkout.session', mode: 'payment', payment_status: 'unpaid', status: 'open',
          amount_total: Number(form['line_items[0][price_data][unit_amount]']), currency: form['line_items[0][price_data][currency]'],
          metadata: { order_id: form['metadata[order_id]'] }, client_reference_id: form.client_reference_id,
          payment_intent: null, expires_at: Number(form.expires_at), success_url: form.success_url, cancel_url: form.cancel_url,
          _transfer_group: form['payment_intent_data[transfer_group]'],
        };
        s.url = `https://checkout.stripe.test/pay/${s.id}`;
        st.sessions[s.id] = s;
        return done(s);
      }
      if (req.method === 'POST' && url.pathname === '/v1/accounts') {
        const a = { id: id('acct'), object: 'account', type: form.type, country: form.country, details_submitted: false, payouts_enabled: false, capabilities: { transfers: form['capabilities[transfers][requested]'] } };
        st.accounts[a.id] = a; return done(a);
      }
      if (req.method === 'POST' && url.pathname === '/v1/account_links') {
        if (!st.accounts[form.account]) return err(404, 'resource_missing', 'No such account');
        return done({ object: 'account_link', url: `https://connect.stripe.test/setup/${form.account}`, return_url: form.return_url, refresh_url: form.refresh_url });
      }
      let m;
      if (req.method === 'GET' && (m = url.pathname.match(/^\/v1\/accounts\/(.+)$/))) {
        const a = st.accounts[m[1]]; return a ? send(200, a) : err(404, 'resource_missing', 'No such account');
      }
      if (req.method === 'GET' && (m = url.pathname.match(/^\/v1\/payment_intents\/(.+)$/))) {
        const pi = st.intents[m[1]]; return pi ? send(200, pi) : err(404, 'resource_missing', 'No such payment_intent');
      }
      if (req.method === 'POST' && url.pathname === '/v1/transfers') {
        if (st.failNextTransfer) { st.failNextTransfer = false; return err(400, 'balance_insufficient', 'simulated failure'); }
        const t = { id: id('tr'), object: 'transfer', amount: Number(form.amount), currency: form.currency, destination: form.destination, source_transaction: form.source_transaction, transfer_group: form.transfer_group, order_id: form['metadata[order_id]'] };
        st.transfers.push(t); return done(t);
      }
      if (req.method === 'POST' && url.pathname === '/v1/refunds') {
        const pi = st.intents[form.payment_intent];
        if (!pi) return err(404, 'resource_missing', 'No such payment_intent');
        if (st.refunds.some((r) => r.payment_intent === form.payment_intent)) return err(400, 'charge_already_refunded', 'Charge already refunded');
        const r = { id: id('re'), object: 'refund', payment_intent: form.payment_intent, amount: pi.amount, reason: form['metadata[reason]'] };
        st.refunds.push(r); return done(r);
      }

      // ---- test controls
      if (req.method === 'POST' && url.pathname === '/_test/complete') {
        const { session_id, amount } = JSON.parse(raw);
        const s = st.sessions[session_id]; if (!s) return err(404, 'resource_missing', 'no session');
        const pi = { id: id('pi'), object: 'payment_intent', amount: s.amount_total, latest_charge: id('ch'), transfer_group: s._transfer_group };
        st.intents[pi.id] = pi;
        const paid = { ...s, payment_status: 'paid', status: 'complete', payment_intent: pi.id, ...(amount ? { amount_total: amount } : {}) };
        st.sessions[s.id] = paid;
        const w = await sendWebhook('checkout.session.completed', paid);
        return send(200, { payment_intent: pi.id, charge: pi.latest_charge, webhook_status: w.status, webhook: w });
      }
      if (req.method === 'POST' && url.pathname === '/_test/account-ready') {
        const { account, webhook } = JSON.parse(raw);
        const a = st.accounts[account]; a.details_submitted = true; a.payouts_enabled = true;
        const w = webhook ? await sendWebhook('account.updated', a) : null;
        return send(200, { webhook_status: w?.status ?? null });
      }
      if (req.method === 'POST' && url.pathname === '/_test/fail-next-transfer') { st.failNextTransfer = true; return send(200, {}); }
      if (req.method === 'POST' && url.pathname === '/_test/raw-webhook') {
        const { type, object, badSignature } = JSON.parse(raw);
        const payload = JSON.stringify({ id: `evt_${++st.evt}`, object: 'event', type, data: { object } });
        const header = badSignature ? 't=1,v1=deadbeef' : Stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
        const r = await fetch(webhookUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': header }, body: payload });
        return send(200, { webhook_status: r.status });
      }
      if (req.method === 'GET' && url.pathname === '/_test/state') return send(200, st);
      err(404, 'resource_missing', `fake stripe: unhandled ${req.method} ${url.pathname}`);
    } catch (e) {
      console.error('[fake-stripe]', e); err(500, 'api_error', String(e));
    }
  });
  await new Promise((r) => server.listen(port, r));
  return { state: st, close: () => new Promise((r) => server.close(r)), url: `http://localhost:${port}` };
}
