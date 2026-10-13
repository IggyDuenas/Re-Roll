import { errorResponse, hasBearer, json } from '@/lib/api';
import { settleOrder } from '@/lib/settlement';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/**
 * Run on a schedule (e.g. hourly). Authorization: Bearer $CRON_SECRET.
 * 1) releases/refunds orders that are due; 2) retries any payout or refund that failed earlier.
 */
export async function POST(req: Request) {
  if (!hasBearer(req, process.env.CRON_SECRET)) return json({ error: 'Unauthorized.' }, 401);
  try {
    const store = getStore();
    const { released, refunded } = await store.settleDue();
    for (const o of [...released, ...refunded]) await settleOrder(store, o);
    const retry = (await store.listPendingSettlements()).filter((o) => ![...released, ...refunded].some((x) => x.id === o.id));
    for (const o of retry) await settleOrder(store, o);
    return json({ ok: true, released: released.length, refunded: refunded.length, retried: retry.length });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Vercel Cron issues GET requests (with the same bearer header). */
export const GET = POST;
