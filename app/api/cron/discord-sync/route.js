import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { syncDiscordCore } from '@/lib/discordSync';
import { detectRescheduleProposals } from '@/lib/hankActions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Pulls #sheetz replies into the comms feed on a schedule, so the team doesn't have to hit
// "Sync from Discord" by hand. Secured by CRON_SECRET (Bearer header from Vercel Cron, or ?key=).
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
  const r = await syncDiscordCore(sb);
  // After pulling new chatter, let Hank propose any reschedule actions (best-effort, never blocks the sync).
  let actions = null;
  try { actions = await detectRescheduleProposals(sb); } catch (_) {}
  return NextResponse.json({ ...r, actions }, { status: r.ok ? 200 : 500 });
}
