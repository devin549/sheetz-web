import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { localRank } from '@/lib/serpLocal';
import { KEYWORDS, LOCATIONS } from '@/lib/rankConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Weekly local-rank scan: keyword × town → SerpAPI local pack → rank_checks. CRON_SECRET-gated.
function authed(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization') || '';
  const key = new URL(request.url).searchParams.get('key') || '';
  return auth === `Bearer ${secret}` || key === secret;
}

export async function GET(request) {
  if (!authed(request)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  if (!process.env.SERPAPI_KEY) return NextResponse.json({ ok: false, error: 'SERPAPI_KEY not set' });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'No admin client' }, { status: 500 });

  // Optional ?loc= to scan a single town (keeps each run under the time budget if needed).
  const onlyLoc = new URL(request.url).searchParams.get('loc');
  const locs = onlyLoc ? LOCATIONS.filter((l) => l.toLowerCase().includes(onlyLoc.toLowerCase())) : LOCATIONS;

  let done = 0, ranking = 0;
  for (const location of locs) {
    for (const keyword of KEYWORDS) {
      try {
        const r = await localRank(keyword, location);
        if (!r.ok) continue;
        await sb.from('rank_checks').insert({ keyword, location, position: r.position, found: r.found, total_shown: r.totalShown, competitors: r.competitors });
        done++; if (r.found) ranking++;
      } catch (_) {}
    }
  }
  return NextResponse.json({ ok: true, checks: done, ranking });
}
