import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { postToDiscord } from '@/lib/discord';
import { sendOne, isEmailConfigured, renderEmailHtml } from '@/lib/email';
import { sendSms, smsConfigured } from '@/lib/twilio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PUBLIC — when a website visitor says "yes" to a FloodBusterz dry-out in the Plumber's Brain, this logs
// the opportunity to sales_referrals (same queue the in-app handoff uses) and notifies the OFFICE (Discord)
// + the FloodBusterz SALESPERSON (email/text). The CUSTOMER IS NEVER AUTO-CONTACTED — a human reaches out.
// Matches the no-auto-send-to-external-parties rule: every outbound here is to internal staff.
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const clean = (v, n = 300) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const dial = (p) => String(p || '').replace(/[^0-9+]/g, '');
export function OPTIONS() { return new NextResponse(null, { headers: CORS }); }

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: 'Bad request.' }, { status: 400, headers: CORS }); }
  if (clean(body.company)) return NextResponse.json({ ok: true }, { headers: CORS }); // honeypot

  const name = clean(body.name, 120);
  const phone = dial(body.phone);
  if (phone.length < 7) return NextResponse.json({ ok: false, error: 'A phone number is needed so FloodBusterz can reach you.' }, { status: 422, headers: CORS });
  const where = clean(body.location || body.address, 200);
  const unit = clean(body.unit, 200);     // e.g. "gas 40-gal Rheem (leaking)"
  const notes = clean(body.notes, 1000);
  // Damage photos (data URLs, already downscaled client-side) → email attachments for the FloodBusterz crew.
  const photos = Array.isArray(body.photos) ? body.photos.filter((p) => /^data:image\//.test(String(p))).slice(0, 4) : [];
  const attachments = photos.map((p, i) => {
    const m = String(p).match(/^data:(image\/[a-z]+);base64,(.+)$/i);
    return m ? { filename: `damage-${i + 1}.${m[1].split('/')[1]}`, content: m[2] } : null;
  }).filter(Boolean);

  const sb = getSupabaseAdmin();
  const note = [
    'FloodBusterz dry-out requested via the website Plumber’s Brain.',
    name && `Name: ${name}`,
    `Phone: ${phone}`,
    where && `Location: ${where}`,
    unit && `Triggering issue: ${unit}`,
    notes && `Notes: ${notes}`,
  ].filter(Boolean).join('\n');

  // Log to the same Sales → Referrals queue the in-app FloodBusterz handoff uses. Fail-soft.
  let refId = null;
  if (sb) {
    try {
      const { data } = await sb.from('sales_referrals')
        .insert({ customer_name: name || null, ref_type: 'fb', note, urgent: true, tech_name: 'Website · Plumber’s Brain' })
        .select('id').maybeSingle();
      refId = data?.id || null;
    } catch (_) {}
    try { await sb.from('audit_log').insert({ actor_name: 'Website', role: 'public', action: 'floodlead.web', entity: 'sales_referral', entity_id: String(refId || ''), detail: { name, phone, unit } }); } catch (_) {}
  }

  // Office ping (Discord / Captain Hook).
  try {
    await postToDiscord(`🌊 **FloodBusterz lead** (web) · 🚨 dry-out\n${name || 'Customer'} · ${phone}${where ? ` · ${where}` : ''}${unit ? `\nUnit: ${unit}` : ''}${attachments.length ? `\n📸 ${attachments.length} damage photo${attachments.length > 1 ? 's' : ''} emailed to FloodBusterz` : ''}${notes ? `\n📝 ${notes.slice(0, 200)}` : ''}\nReview in Sales → Referrals. (Customer not auto-contacted.)`);
  } catch (_) {}

  // Notify the FloodBusterz salesperson directly — INTERNAL staff only. Customer is not contacted.
  const SALES_EMAILS = (process.env.FLOODBUSTERZ_SALES_EMAIL || '').split(',').map((s) => s.trim()).filter(Boolean);
  const SALES_PHONE = process.env.FLOODBUSTERZ_SALES_PHONE || '';
  const summary = `New FloodBusterz dry-out lead from the website. ${name || 'Customer'} ${phone}${where ? ` · ${where}` : ''}${unit ? ` · ${unit}` : ''}. Call them to scope the restoration.`;
  if (SALES_EMAILS.length && isEmailConfigured) {
    const html = renderEmailHtml({ subject: 'FloodBusterz web lead', body: summary + (notes ? `\n\nNotes: ${notes}` : '') + (attachments.length ? `\n\n${attachments.length} damage photo${attachments.length > 1 ? 's' : ''} attached.` : '') });
    for (const to of SALES_EMAILS) {
      try { await sendOne({ to, subject: `🌊 FloodBusterz web lead — ${name || phone}`, html, attachments: attachments.length ? attachments : undefined }); } catch (_) {}
    }
  }
  if (SALES_PHONE && smsConfigured()) {
    try { await sendSms(SALES_PHONE, summary); } catch (_) {}
  }

  return NextResponse.json({ ok: true, message: "Done — FloodBusterz will reach out to get the dry-out scheduled. We never share your number outside Clog Busterz." }, { headers: CORS });
}
