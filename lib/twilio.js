// Server-only Twilio SMS sender. Needs TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + a sender
// (TWILIO_FROM number OR TWILIO_MESSAGING_SERVICE_SID). Every customer-facing send is HUMAN-initiated
// and logged to cb_comms — never an automated blast (per the no-auto-send rule).

export function smsConfigured() {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID));
}

// Normalize a US phone to E.164 (+1XXXXXXXXXX). Returns null if it doesn't look like a real number.
export function toE164(raw) {
  const s = String(raw || '').trim();
  const d = s.replace(/[^\d]/g, '');
  if (s.startsWith('+') && d.length >= 11) return '+' + d;
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return null;
}

export async function sendSms(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return { ok: false, msg: 'Twilio not configured (TWILIO_ACCOUNT_SID / AUTH_TOKEN).' };
  const from = process.env.TWILIO_FROM, msgSvc = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (!from && !msgSvc) return { ok: false, msg: 'Add TWILIO_FROM (your Twilio number) in Vercel to send texts.' };
  const e164 = toE164(to);
  if (!e164) return { ok: false, msg: 'No valid phone number on file.' };

  const params = new URLSearchParams();
  params.set('To', e164);
  if (msgSvc) params.set('MessagingServiceSid', msgSvc); else params.set('From', from);
  params.set('Body', String(body || '').slice(0, 1500));
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const j = await r.json();
    if (!r.ok) return { ok: false, msg: j.message || ('Twilio error ' + r.status) };
    return { ok: true, sid: j.sid, to: e164 };
  } catch (e) { return { ok: false, msg: 'Send failed: ' + (e && e.message ? e.message : String(e)) }; }
}
