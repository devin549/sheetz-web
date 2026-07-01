// Resend delivery webhook. Resend POSTs email.delivered / email.bounced / email.complained here; we update
// the matching email_deliveries row and, on a hard bounce/complaint, flag the customer's email so the office
// fixes it. Signed with Svix (RESEND_WEBHOOK_SECRET). Set the URL + secret in the Resend dashboard.
import crypto from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function verify(secret, headers, body) {
  // FAIL-CLOSED (audit P2-12): with no secret set, REJECT everything. Previously this accepted unsigned events,
  // so anyone who found this URL could POST a fake email.bounced and flag a real customer's email as bad
  // (killing their deliverability). The webhook is optional — until RESEND_WEBHOOK_SECRET is set in Vercel AND
  // the endpoint is registered in Resend, this endpoint simply accepts nothing. No feature is lost meanwhile.
  if (!secret) return false;
  const id = headers.get('svix-id'), ts = headers.get('svix-timestamp'), sigHeader = headers.get('svix-signature');
  if (!id || !ts || !sigHeader) return false;
  try {
    const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    const expected = crypto.createHmac('sha256', secretBytes).update(`${id}.${ts}.${body}`).digest('base64');
    return sigHeader.split(' ').some((p) => {
      const v = p.split(',')[1]; if (!v) return false;
      const a = Buffer.from(v), b = Buffer.from(expected);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    });
  } catch (_) { return false; }
}

const STATUS_BY_TYPE = { 'email.delivered': 'delivered', 'email.bounced': 'bounced', 'email.complained': 'complained', 'email.sent': 'sent', 'email.delivery_delayed': 'sent' };

export async function POST(req) {
  const body = await req.text();
  if (!verify(process.env.RESEND_WEBHOOK_SECRET, req.headers, body)) return new Response('bad signature', { status: 401 });
  let evt; try { evt = JSON.parse(body); } catch (_) { return new Response('bad json', { status: 400 }); }
  const status = STATUS_BY_TYPE[evt?.type];
  if (!status) return new Response('ignored', { status: 200 });

  const data = evt.data || {};
  const resendId = data.email_id || data.id || null;
  const toEmail = Array.isArray(data.to) ? data.to[0] : data.to;
  const isBad = status === 'bounced' || status === 'complained';
  const sb = getSupabaseAdmin();
  if (!sb) return new Response('no db', { status: 200 });

  try {
    let custId = null, custEmail = null;
    if (resendId) {
      try {
        const { data: d } = await sb.from('email_deliveries')
          .update({ status, updated_at: new Date().toISOString(), ...(isBad ? { error: (data.bounce && data.bounce.message) || evt.type } : {}) })
          .eq('resend_id', resendId).select('customer_id, to_email').maybeSingle();
        if (d) { custId = d.customer_id || null; custEmail = d.to_email || null; }
      } catch (_) {}
    }
    if (isBad) {
      const email = toEmail || custEmail;
      if (!custId && email) { try { const { data: c } = await sb.from('customers').select('id').eq('email', email).limit(1).maybeSingle(); custId = c?.id || null; } catch (_) {} }
      if (custId) { try { await sb.from('customers').update({ email_status: status, email_bounced_at: new Date().toISOString() }).eq('id', custId); } catch (_) {} }
    }
  } catch (_) {}
  return new Response('ok', { status: 200 });
}
