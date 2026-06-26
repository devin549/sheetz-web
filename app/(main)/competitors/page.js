import { requirePerm } from '@/lib/guard';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { LOCATIONS } from '@/lib/rankConfig';

export const dynamic = 'force-dynamic';

export default async function Competitors() {
  await requirePerm('seeReports', 'manageUsers', 'seeFinancials', 'seeAllJobs');
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">⭐ Review Intelligence</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;
  const sb = getSupabaseAdmin();

  let rows = [], needsMig = false;
  try {
    const { data, error } = await sb.from('competitor_snapshots').select('business_name, town, rating, reviews, is_us, captured_at').order('captured_at', { ascending: false }).limit(4000);
    if (error) { if (/relation|does not exist|schema cache/i.test(error.message)) needsMig = true; } else rows = data || [];
  } catch { needsMig = true; }
  if (needsMig) return <div className="wrap"><div className="h1">⭐ Review Intelligence</div><div className="notice">Run <code>supabase/109_competitor_snapshots.sql</code>, then the scan populates this.</div></div>;

  // Latest + prior snapshot per (town, business) for the leaderboard + momentum.
  const latest = {}, prior = {};
  rows.forEach((r) => { const k = r.town + '|' + r.business_name.toLowerCase(); if (!latest[k]) latest[k] = r; else if (!prior[k]) prior[k] = r; });
  const lastDay = rows[0]?.captured_at ? new Date(rows[0].captured_at).toLocaleDateString() : '—';

  const byTown = {}; LOCATIONS.forEach((l) => { byTown[l.split(',')[0]] = []; });
  Object.entries(latest).forEach(([k, r]) => { const list = byTown[r.town]; if (!list) return; const p = prior[k]; list.push({ ...r, deltaReviews: p && p.reviews != null && r.reviews != null ? r.reviews - p.reviews : null }); });
  Object.values(byTown).forEach((l) => l.sort((a, b) => (b.reviews || 0) - (a.reviews || 0)));

  return (
    <div className="wrap" style={{ maxWidth: 880 }}>
      <div className="h1" style={{ marginBottom: 2 }}>⭐ Review Intelligence</div>
      <p className="muted" style={{ fontSize: 13 }}>Clog Busterz vs every other plumber in the local pack, by reviews. ▲ = reviews gained since last scan. Last scan: {lastDay}.</p>

      {Object.entries(byTown).every(([, l]) => l.length === 0) ? (
        <div className="card">No snapshots yet — run <code>node scripts/run_competitor_scan.cjs</code> (or wait for the weekly cron).</div>
      ) : LOCATIONS.map((loc) => {
        const town = loc.split(',')[0]; const list = byTown[town] || []; if (!list.length) return null;
        const usRank = list.findIndex((x) => x.is_us);
        return (
          <div key={town} style={{ marginTop: 16 }}>
            <div className="h2" style={{ fontSize: 15 }}>{town} {usRank >= 0
              ? <span style={{ fontSize: 12, fontWeight: 600, color: usRank < 3 ? 'var(--green)' : 'var(--amber)' }}>· you're #{usRank + 1} by reviews</span>
              : <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--red)' }}>· you're not in the pack here</span>}</div>
            <div style={{ display: 'grid', gap: 4 }}>
              {list.slice(0, 8).map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: r.is_us ? 'rgba(255,179,0,.12)' : 'var(--surface-2)', border: r.is_us ? '1px solid var(--amber)' : '1px solid var(--border)' }}>
                  <span style={{ width: 20, textAlign: 'center', fontWeight: 800, color: 'var(--fg-3)' }}>{i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0, fontWeight: r.is_us ? 800 : 600, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.business_name}{r.is_us ? ' 👈 you' : ''}</span>
                  {r.rating != null && <span className="pill" style={{ fontSize: 11 }}>★ {r.rating}</span>}
                  <span style={{ fontWeight: 700, fontSize: 13, minWidth: 54, textAlign: 'right' }}>{r.reviews != null ? r.reviews.toLocaleString() : '—'}</span>
                  {r.deltaReviews ? <span style={{ fontSize: 11, color: r.deltaReviews > 0 ? 'var(--green)' : 'var(--fg-3)', minWidth: 34, textAlign: 'right' }}>{r.deltaReviews > 0 ? `▲${r.deltaReviews}` : ''}</span> : <span style={{ minWidth: 34 }} />}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
