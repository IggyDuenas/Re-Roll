import { errorResponse, hasBearer, json } from '@/lib/api';
import { payments } from '@/lib/payments';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** Run on a schedule (e.g. hourly). Authorization: Bearer $CRON_SECRET. Releases or refunds due orders. */
export async function POST(req: Request) {
  if (!hasBearer(req, process.env.CRON_SECRET)) return json({ error: 'Unauthorized.' }, 401);
  try {
    const { released, refunded } = await getStore().settleDue();
    for (const o of released) await payments.release(o);
    for (const o of refunded) await payments.refund(o);
    return json({ ok: true, released: released.length, refunded: refunded.length });
  } catch (err) {
    return errorResponse(err);
  }
}
