import { errorResponse, json, readJson, text } from '@/lib/api';
import { normalizePhone } from '@/lib/phone';
import { config } from '@/lib/config';
import { feeFor, validatePricing } from '@/lib/pricing';
import { baseUrl, sendSms } from '@/lib/sms';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body) return json({ error: 'Invalid JSON body.' }, 400);

  const eventId = text(body.eventId, 100);
  if (!eventId) return json({ error: 'Choose an event.' }, 400);
  const phone = normalizePhone(body.phone);
  if (!phone) return json({ error: 'Enter a valid mobile number (10 digits for US, or +country code).' }, 400);
  const faceValueCents = Number(body.faceValueCents);
  const priceCents = Number(body.priceCents);
  const pricingError = validatePricing(faceValueCents, priceCents);
  if (pricingError) return json({ error: pricingError, code: 'bad_price' }, 400);
  const proofNote = text(body.proofNote, 500);
  if (proofNote.length < 4) return json({ error: 'Add your Dice order reference or ticket details so buyers and our team can check it.' }, 400);
  if (body.confirmOwnership !== true) return json({ error: 'Please confirm you own this ticket and understand the resale terms.' }, 400);
  const sellerName = text(body.name, 60) || null;

  try {
    const listing = await getStore().createListing({ eventId, sellerPhone: phone, sellerName, faceValueCents, priceCents, proofNote });
    const link = `${baseUrl(req)}/s/${listing.seller_token}`;
    const { sent } = await sendSms(phone, `re·roll: your listing is live at $${(priceCents / 100).toFixed(2)}. You'll receive $${((priceCents - feeFor(priceCents)) / 100).toFixed(2)} after our ${config.feePct}% fee when it sells. Manage it here: ${link}`);
    return json({ ok: true, listingId: listing.id, sms: sent ? 'sent' : 'console', ...(sent ? {} : { devLink: link }) }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
