import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { postToDiscord } from '@/lib/discord';
import { etWeekday, announceText } from '@/lib/onCall';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Posts the day's on-call to #sheetz at 4:30pm ET (on-call starts at 5). Mon–Thu = that night; Fri = the
// weekend; Sat/Sun skipped (already announced Friday). Secured by CRON_SECRET.
function authed(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization') || '';
  return auth === `Bearer ${secret}`; // header-only (audit P2-13): ?key= leaked the CRON_SECRET into access logs
}

export async function GET(request) {
  if (!authed(request)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const wd = etWeekday();
  if (wd === 'Saturday' || wd === 'Sunday') return NextResponse.json({ ok: true, skipped: wd });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'No admin client' }, { status: 500 });
  const { data: sched } = await sb.from('on_call_schedule').select('*').eq('slot', 'current').maybeSingle();
  const msg = announceText(sched, wd);
  if (!msg) return NextResponse.json({ ok: true, skipped: 'no on-call set for ' + wd });
  const r = await postToDiscord(msg);
  return NextResponse.json({ ok: !!r.ok, weekday: wd, posted: r.ok, error: r.ok ? undefined : r.error });
}
