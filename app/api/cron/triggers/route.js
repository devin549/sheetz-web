import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ALL_SCANS } from '@/lib/alertScans';
import { createAlert, escalateStaleAlerts } from '@/lib/alerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// P4 trigger brain — runs every named-workflow scanner and turns each hit into an in-app task (deduped).
// In-app FIRST: this endpoint never sends email/text. Secured by CRON_SECRET. Run it every ~5–10 min.
function authed(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization') || '';
  const key = new URL(request.url).searchParams.get('key') || '';
  return auth === `Bearer ${secret}` || key === secret;
}

export async function GET(request) {
  if (!authed(request)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'No admin client' }, { status: 500 });
  const now = Date.now();

  const summary = {};
  let created = 0, bumped = 0;
  for (const scan of ALL_SCANS) {
    let hits = [];
    try { hits = (await scan(sb, now)) || []; } catch (_) { hits = []; }
    for (const a of hits) {
      const r = await createAlert(sb, { ...a, nowISO: new Date(now).toISOString() });
      if (r.ok && r.created) created++;
      else if (r.ok) bumped++;
      if (r.error) summary._error = r.error;
    }
    summary[scan.name] = hits.length;
  }
  // ESCALATION TIER — after creating/bumping tasks, push any HIGH-sev one that's sat unclaimed past the
  // threshold to the office (#dispatch) so a late/silent-tech alert can't go all day unseen. Best-effort.
  let escalation = null;
  try { escalation = await escalateStaleAlerts(sb, { nowISO: new Date(now).toISOString() }); } catch (_) {}
  return NextResponse.json({ ok: true, created, bumped, escalation, scanned: summary, at: new Date(now).toISOString() });
}
