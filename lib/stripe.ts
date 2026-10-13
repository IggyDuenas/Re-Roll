import Stripe from 'stripe';

let client: Stripe | null = null;

/**
 * Shared Stripe client. STRIPE_API_BASE (e.g. http://localhost:12111) points the SDK at a local fake
 * for tests; it is honored ONLY with a test-mode key so it can never redirect live traffic.
 */
export function stripe(): Stripe {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  const base = process.env.STRIPE_API_BASE;
  const host = base && key.startsWith('sk_test_') ? new URL(base) : null;
  client = new Stripe(key, {
    maxNetworkRetries: 2,
    ...(host ? { host: host.hostname, port: host.port, protocol: host.protocol.replace(':', '') as 'http' | 'https' } : {}),
  });
  return client;
}
