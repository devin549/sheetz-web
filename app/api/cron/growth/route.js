import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { rankScanCore, pricingScanCore } from '@/lib/growthScan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Weekly growth scan — rank scan + cheap INCREMENTAL pricing on the top competitors. Secured by
// CRON_SECRET (Vercel Cron sends it as a Bearer header; ?key= also works for manual runs). Costs
// SerpAPI credits, so it must be authenticated — no anonymous triggering.
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

  const rank = await rankScanCore(sb, 'weekly-cron');

  // top local competitors from the freshest rank scan → incremental pricing (recent reviews only)
  const priced = [];
  try {
    const { data } = await sb.from('seo_rankings').select('location, local_results, scanned_at').order('scanned_at', { ascending: false }).limit(60);
    const rows = data || [];
    const latestT = rows[0] && rows[0].scanned_at;
    const latest = rows.filter((r) => r.scanned_at === latestT);
    const seen = new Set(); const targets = [];
    for (const r of latest) for (const p of (r.local_results || [])) { const n = String(p.name || '').trim(); if (n && !n.toLowerCase().includes('clog buster') && !seen.has(n)) { seen.add(n); targets.push({ name: n, loc: r.location }); } }
    for (const t of targets.slice(0, 5)) {
      const pr = await pricingScanCore(sb, { comp: t.name, loc: t.loc, role: 'owner', scannedBy: 'weekly-cron', monthsBack: 1, maxPages: 2 });
      priced.push({ competitor: t.name, ok: pr.ok, inserted: pr.inserted || 0, msg: pr.ok ? undefined : pr.msg });
    }
  } catch (e) { /* best-effort */ }

  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), rank: { count: rank.count || 0, credits: rank.credits || 0, errors: (rank.errors || []).length, msg: rank.ok ? undefined : rank.msg }, pricing: priced });
}
