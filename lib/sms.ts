/** Sends the ticket link by SMS via Twilio if configured, else prints it to the server console. */
export async function sendTicketSms(phone: string, link: string, eventTitle: string): Promise<{ sent: boolean }> {
  const body = `re·roll: your ticket for ${eventTitle} is ready. Open it at the door: ${link}\nCan't go? Re-roll it from the same link.`;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !auth || !from) {
    console.log(`\n[re·roll sms:console] to ${phone}\n  ${body.replace(/\n/g, '\n  ')}\n`);
    return { sent: false };
  }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${auth}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: phone, From: from, Body: body }),
    });
    if (!res.ok) {
      console.error(`[re·roll sms] Twilio ${res.status}: ${await res.text()}`);
      console.log(`[re·roll sms:fallback] ${phone} -> ${link}`);
      return { sent: false };
    }
    return { sent: true };
  } catch (err) {
    console.error('[re·roll sms] Twilio request failed', err);
    console.log(`[re·roll sms:fallback] ${phone} -> ${link}`);
    return { sent: false };
  }
}
