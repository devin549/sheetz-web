import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { buildDigest } from '@/lib/growthDigest';
import { sendOne, isEmailConfigured } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Friday digest cron. Secured by CRON_SECRET (Vercel Cron sends it as a Bearer header; ?key= also
// works for manual runs). Emails DIGEST_TO the week's rank moves + competitor prices.
function authed(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization') || '';
  const key = new URL(request.url).searchParams.get('key') || '';
  return auth === `Bearer ${secret}` || key === secret;
}

export async function GET(request) {
  if (!authed(request)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  if (!isEmailConfigured) return NextResponse.json({ ok: false, error: 'EMAIL_API_KEY not set' }, { status: 500 });
  const to = (process.env.DIGEST_TO || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!to.length) return NextResponse.json({ ok: false, error: 'Set DIGEST_TO' }, { status: 500 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'No admin client' }, { status: 500 });

  const d = await buildDigest(sb);
  if (!d.hasContent) return NextResponse.json({ ok: true, skipped: 'no content yet' });

  const results = [];
  for (const addr of to) {
    const r = await sendOne({ to: addr, subject: d.subject, html: d.html });
    results.push({ to: addr, ok: r.ok, error: r.ok ? undefined : r.error });
    try { await sb.from('cb_comms').insert({ channel: 'email', to_addr: addr, body: d.subject, status: r.ok ? 'sent' : 'failed', error: r.ok ? null : r.error, sent_by: 'weekly-cron' }); } catch (_) {}
  }
  return NextResponse.json({ ok: true, sent: results, stats: d.stats });
}
