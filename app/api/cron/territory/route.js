import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { aggregateTerritory, VOLUME_ALERT_PCT } from '@/lib/territory';
import { postToDiscord } from '@/lib/discord';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Weekly volume watch: per-city job volume swing ≥ ±VOLUME_ALERT_PCT → ping the office. CRON_SECRET-gated.
function authed(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization') || '';
  return auth === `Bearer ${secret}`; // header-only (audit P2-13): ?key= leaked the CRON_SECRET into access logs
}

export async function GET(request) {
  if (!authed(request)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'No admin client' }, { status: 500 });

  let jobs = [];
  try { const since = new Date(Date.now() - 60 * 86400000).toISOString(); const { data } = await sb.from('jobs').select('city, address, scheduled_at, customers(city, address)').gte('scheduled_at', since).limit(8000); jobs = data || []; } catch (_) {}
  const swings = aggregateTerritory(jobs).filter((a) => a.deltaPct != null && Math.abs(a.deltaPct) >= VOLUME_ALERT_PCT);
  if (swings.length) {
    const lines = swings.map((a) => `${a.deltaPct >= 0 ? '📈' : '📉'} **${a.city}** ${a.deltaPct >= 0 ? '+' : ''}${a.deltaPct}% — ${a.jobs30} this month vs ${a.jobsPrev30} prior`).join('\n');
    try { await postToDiscord(`🗺️ **Territory volume check**\n${lines}`, { to: 'office' }); } catch (_) {}
  }
  return NextResponse.json({ ok: true, swings: swings.length });
}
