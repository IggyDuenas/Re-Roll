import { errorResponse, json, readJson } from '@/lib/api';
import { normalizePhone } from '@/lib/phone';
import { sendTicketSms } from '@/lib/sms';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body) return json({ error: 'Invalid JSON body.' }, 400);

  const eventId = typeof body.eventId === 'string' ? body.eventId : '';
  if (!eventId) return json({ error: 'eventId is required.' }, 400);

  const phone = normalizePhone(body.phone);
  if (!phone) return json({ error: 'Enter a valid mobile number (10 digits for US, or +country code).' }, 400);

  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 80) : null;

  try {
    const store = getStore();
    const { ticket, resold } = await store.purchase({ eventId, phone, name });
    const event = await store.getEvent(eventId);
    const base = process.env.APP_URL?.replace(/\/$/, '') || new URL(req.url).origin;
    const link = `${base}/t/${ticket.token}`;
    const { sent } = await sendTicketSms(phone, link, event?.title ?? 'your event');
    return json(
      {
        ok: true,
        resold,
        sms: sent ? 'sent' : 'console',
        ticket: { id: ticket.id, status: ticket.status, eventId },
        // Only exposed when no SMS provider is configured (local dev), so the flow is testable.
        ...(sent ? {} : { devLink: link }),
      },
      201,
    );
  } catch (err) {
    return errorResponse(err);
  }
}
