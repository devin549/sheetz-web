import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireRole } from '@/lib/guard';
import { cbAvgTickets } from '@/lib/cbStats';
import GrowthClient from './GrowthClient';
import PricingRadar from './PricingRadar';

export const dynamic = 'force-dynamic';

export default async function Growth() {
  await requireRole(['owner', 'admin', 'gm', 'marketing', 'sales', 'om']);

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Growth & Intel</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const res = await sb.from('seo_rankings')
    .select('keyword, location, cb_rank, cb_in_local, top_results, local_results, scanned_at')
    .order('scanned_at', { ascending: false }).limit(300);

  if (res.error && /could not find|does not exist|schema cache/i.test(res.error.message || '')) {
    return (
      <div className="wrap" style={{ maxWidth: 1000 }}>
        <div className="h1">Growth & Intel</div>
        <p className="muted">Where Clog Busterz ranks for core plumbing keywords in each market (via SerpAPI).</p>
        <div className="notice">Rank tracking needs its table — run <code>supabase/44_seo_rankings.sql</code> in Supabase, then hit Run scan.</div>
      </div>
    );
  }

  const rows = res.data || [];
  const times = [...new Set(rows.map((r) => r.scanned_at))];
  const latestT = times[0] || null, prevT = times[1] || null;
  const latest = rows.filter((r) => r.scanned_at === latestT);
  const prev = {};
  rows.filter((r) => r.scanned_at === prevT).forEach((r) => { prev[`${r.keyword}|${r.location}`] = r.cb_rank; });

  // Pricing radar inputs: competitor names + markets from the latest scan, CB baseline, saved prices.
  const compNames = [...new Set(latest.flatMap((r) => (r.local_results || []).map((p) => p.name)).filter(Boolean))];
  const markets = [...new Set(latest.map((r) => r.location))];
  const cbAvg = await cbAvgTickets(sb);
  let recent = [];
  const cp = await sb.from('competitor_pricing').select('competitor, service, price_cents, location, scanned_at').order('scanned_at', { ascending: false }).limit(40);
  if (!cp.error) recent = cp.data || [];

  return (
    <div className="wrap" style={{ maxWidth: 1000 }}>
      <div className="h1">Growth & Intel</div>
      <p className="muted">Where Clog Busterz ranks for core plumbing keywords in each market. Run a scan to refresh; history builds the trend.</p>
      <GrowthClient latest={latest} prev={prev} scannedAt={latestT} hasKey />
      <PricingRadar competitors={compNames} markets={markets} cbAvg={cbAvg} recent={recent} />
    </div>
  );
}
