import { errorResponse, hasBearer, json, readJson } from '@/lib/api';
import { settleOrder } from '@/lib/settlement';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** Operator resolves a disputed order. Authorization: Bearer $ADMIN_SECRET. Body: {action: 'release'|'refund'}. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!hasBearer(req, process.env.ADMIN_SECRET)) return json({ error: 'Unauthorized.' }, 401);
  const body = await readJson(req);
  const action = body?.action;
  if (action !== 'release' && action !== 'refund') return json({ error: "action must be 'release' or 'refund'." }, 400);
  try {
    const order = await getStore().resolveDispute(params.id, action);
    await settleOrder(getStore(), order);
    return json({ ok: true, status: order.status });
  } catch (err) {
    return errorResponse(err);
  }
}
