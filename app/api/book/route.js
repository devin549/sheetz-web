import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { postToDiscord } from '@/lib/discord';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PUBLIC booking intake — the CB website's "Schedule" form POSTs here. Creates a customer + a job (on the
// dispatch board for the office to confirm) and records the tech's ?ref= code so the booking is attributed.
// No auth (it's a public form). Honeypot + basic validation guard against bots.
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const clean = (v, n = 300) => String(v == null ? '' : v).trim().slice(0, n);
const dial = (p) => String(p || '').replace(/[^0-9+]/g, '');

export function OPTIONS() { return new NextResponse(null, { headers: CORS }); }

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: 'Bad request.' }, { status: 400, headers: CORS }); }
  if (clean(body.company)) return NextResponse.json({ ok: true }, { headers: CORS }); // honeypot field filled = bot, silently accept

  const name = clean(body.name, 120);
  const phone = dial(body.phone);
  if (!name || phone.length < 7) return NextResponse.json({ ok: false, error: 'Name and a valid phone are required.' }, { status: 422, headers: CORS });
  const email = clean(body.email, 160), address = clean(body.address, 300), service = clean(body.service, 120) || 'Service request';
  const notes = clean(body.notes, 1000), ref = clean(body.ref || body.referral_code, 60);

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'Unavailable.' }, { status: 503, headers: CORS });

  // Find or create the customer (by phone).
  let customerId = null;
  try {
    const { data: existing } = await sb.from('customers').select('id').eq('phone', phone).limit(1).maybeSingle();
    if (existing) customerId = existing.id;
    else { const { data: c } = await sb.from('customers').insert({ name, phone, email: email || null, address: address || null }).select('id').maybeSingle(); customerId = c?.id || null; }
  } catch (_) {}

  // Create the job (status hold = unconfirmed web request the office schedules a time for).
  const base = { customer_id: customerId, job_type: service, status: 'hold', notes: `🌐 WEB BOOKING — confirm a time.\n${notes}`.trim() };
  const extra = { referral_code: ref || null, how_heard: 'website', address: address || null, scheduled_at: new Date().toISOString() };
  let jobId = null;
  let { data: job, error } = await sb.from('jobs').insert({ ...base, ...extra }).select('id').maybeSingle();
  if (error && /column|schema cache|does not exist/i.test(error.message || '')) ({ data: job, error } = await sb.from('jobs').insert(base).select('id').maybeSingle());
  if (error) return NextResponse.json({ ok: false, error: 'Could not save the booking.' }, { status: 500, headers: CORS });
  jobId = job?.id || null;

  try { await sb.from('audit_log').insert({ actor_name: 'Website', role: 'public', action: 'booking.web', entity: 'job', entity_id: String(jobId || ''), detail: { name, service, ref } }); } catch (_) {}
  try { await postToDiscord(`🌐 **New web booking**\n${name} · ${phone}${address ? ` · ${address}` : ''}\nService: ${service}${ref ? `\nReferral: ${ref}` : ''}${notes ? `\n📝 ${notes.slice(0, 200)}` : ''}\nConfirm a time on the board.`); } catch (_) {}

  return NextResponse.json({ ok: true, jobId, message: "Thanks! We've got your request — we'll text you to confirm a time." }, { headers: CORS });
}
