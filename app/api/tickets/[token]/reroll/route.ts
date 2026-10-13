import { errorResponse, json, readJson } from '@/lib/api';
import { getStore } from '@/lib/store';
import { isTokenShaped } from '@/lib/tokens';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const body = await readJson(req);
  const action = body?.action;
  if (action !== 'list' && action !== 'cancel') return json({ error: "action must be 'list' or 'cancel'." }, 400);
  if (!isTokenShaped(params.token)) return json({ error: 'This ticket no longer exists.', code: 'ticket_not_found' }, 404);

  try {
    const store = getStore();
    const ticket = action === 'list' ? await store.listTicket(params.token) : await store.cancelListing(params.token);
    return json({ ok: true, status: ticket.status });
  } catch (err) {
    return errorResponse(err);
  }
}
