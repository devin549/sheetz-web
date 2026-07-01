import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { localRank } from '@/lib/serpLocal';
import { LOCATIONS, BIZ_MATCH } from '@/lib/rankConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Weekly competitor-review snapshot per town. CRON_SECRET-gated.
function authed(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization') || '';
  return auth === `Bearer ${secret}`; // header-only (audit P2-13): ?key= leaked the CRON_SECRET into access logs
}

export async function GET(request) {
  if (!authed(request)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  if (!process.env.SERPAPI_KEY) return NextResponse.json({ ok: false, error: 'SERPAPI_KEY not set' });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'No admin client' }, { status: 500 });

  const rows = [];
  for (const location of LOCATIONS) {
    try {
      const r = await localRank('plumber', location);
      if (!r.ok) continue;
      const town = location.split(',')[0];
      (r.competitors || []).forEach((c) => { if (c.name) rows.push({ business_name: c.name, town, rating: c.rating || null, reviews: c.reviews || null, is_us: BIZ_MATCH.test(c.name) }); });
    } catch (_) {}
  }
  if (rows.length) { try { await sb.from('competitor_snapshots').insert(rows); } catch (_) {} }
  return NextResponse.json({ ok: true, snapshots: rows.length });
}
