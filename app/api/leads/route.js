import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

// Public lead-intake endpoint. The website form POSTs here; leads land in web_leads → /web-leads.
// Self-authenticates via an optional shared secret (no user cookie). Honeypot + validation guard
// against bots. Never auto-creates customers/jobs — booking stays a manual office action.
export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-cb-intake-key',
};
const clean = (v, n = 300) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const json = (body, status = 200) => NextResponse.json(body, { status, headers: CORS });

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req) {
  let data = {};
  const ct = req.headers.get('content-type') || '';
  try {
    if (ct.includes('application/json')) data = await req.json();
    else { const fd = await req.formData(); fd.forEach((v, k) => { data[k] = v; }); }
  } catch { return json({ ok: false, error: 'Bad request body.' }, 400); }

  // Honeypot — bots fill hidden fields; pretend success so they don't retry.
  if (clean(data.company) || clean(data._hp)) return json({ ok: true });

  // Shared secret (only enforced if configured, so it works out of the box for testing).
  const secret = process.env.WEB_LEADS_INTAKE_SECRET;
  if (secret) {
    const provided = req.headers.get('x-cb-intake-key') || clean(data.key, 200);
    if (provided !== secret) return json({ ok: false, error: 'Unauthorized.' }, 401);
  }

  const name = clean(data.name, 120), phone = clean(data.phone, 40), email = clean(data.email, 160);
  if (!name && !phone && !email) return json({ ok: false, error: 'Need a name, phone, or email.' }, 422);

  const sb = getSupabaseAdmin();
  if (!sb) return json({ ok: false, error: 'Server not configured.' }, 503);

  const row = {
    name: name || null, phone: phone || null, email: email || null,
    address: clean(data.address, 200) || null, service: clean(data.service, 160) || null,
    message: clean(data.message, 1000) || null, source: clean(data.source, 40) || 'web', status: 'new',
  };
  const { data: ins, error } = await sb.from('web_leads').insert(row).select('id').single();
  if (error) {
    if (/could not find|does not exist|schema cache/i.test(error.message || '')) {
      return json({ ok: false, error: 'Lead intake not set up — run supabase/28_web_leads.sql.' }, 503);
    }
    return json({ ok: false, error: error.message }, 500);
  }
  return json({ ok: true, id: ins.id });
}
