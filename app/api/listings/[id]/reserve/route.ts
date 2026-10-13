import { errorResponse, json, readJson, text } from '@/lib/api';
import { config } from '@/lib/config';
import { normalizePhone } from '@/lib/phone';
import { baseUrl, sendSms } from '@/lib/sms';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await readJson(req);
  if (!body) return json({ error: 'Invalid JSON body.' }, 400);
  const phone = normalizePhone(body.phone);
  if (!phone) return json({ error: 'Enter a valid mobile number (10 digits for US, or +country code).' }, 400);
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return json({ error: 'Listing not found.', code: 'listing_not_found' }, 404);

  try {
    const order = await getStore().reserve(params.id, { phone, name: text(body.name, 60) || null });
    const link = `${baseUrl(req)}/o/${order.buyer_token}`;
    const { sent } = await sendSms(phone, `re·roll: your ticket is reserved for ${config.reserveMinutes} minutes. Complete payment to lock it in: ${link}`);
    return json({ ok: true, orderToken: order.buyer_token, orderPath: `/o/${order.buyer_token}`, sms: sent ? 'sent' : 'console' }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
