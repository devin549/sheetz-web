import { requirePerm } from '@/lib/guard';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { KEYWORDS, LOCATIONS } from '@/lib/rankConfig';

export const dynamic = 'force-dynamic';

const cellColor = (p) => p == null ? { bg: 'var(--surface-2)', fg: 'var(--fg-3)', t: '—' }
  : p <= 3 ? { bg: 'rgba(76,175,80,.18)', fg: 'var(--green)', t: '#' + p }
  : p <= 10 ? { bg: 'rgba(255,179,0,.16)', fg: 'var(--amber)', t: '#' + p }
  : { bg: 'var(--surface-2)', fg: 'var(--fg-2)', t: '#' + p };

export default async function RankTracker() {
  await requirePerm('seeReports', 'manageUsers', 'seeFinancials', 'seeAllJobs');
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">📍 Local Rank Tracker</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;
  const sb = getSupabaseAdmin();

  let rows = [], needsMig = false;
  try {
    const { data, error } = await sb.from('rank_checks').select('keyword, location, position, found, total_shown, competitors, checked_at').order('checked_at', { ascending: false }).limit(2000);
    if (error) { if (/relation|does not exist|schema cache/i.test(error.message)) needsMig = true; } else rows = data || [];
  } catch { needsMig = true; }
  if (needsMig) return <div className="wrap"><div className="h1">📍 Local Rank Tracker</div><div className="notice">Run <code>supabase/107_rank_checks.sql</code>, then the scan populates this.</div></div>;

  // Latest check per keyword|location.
  const latest = {}; rows.forEach((r) => { const k = r.keyword + '|' + r.location; if (!latest[k]) latest[k] = r; });
  const lastChecked = rows[0]?.checked_at ? new Date(rows[0].checked_at).toLocaleDateString() : '—';
  const cells = Object.values(latest);
  const ranking = cells.filter((c) => c.found && c.position <= 3).length;
  const present = cells.filter((c) => c.found).length;

  // Biggest gap towns (where we're least visible).
  const byLoc = {}; LOCATIONS.forEach((l) => { byLoc[l] = { present: 0, top3: 0, total: 0 }; });
  cells.forEach((c) => { if (!byLoc[c.location]) return; byLoc[c.location].total++; if (c.found) byLoc[c.location].present++; if (c.found && c.position <= 3) byLoc[c.location].top3++; });

  return (
    <div className="wrap" style={{ maxWidth: 1000 }}>
      <div className="h1" style={{ marginBottom: 2 }}>📍 Local Rank Tracker</div>
      <p className="muted" style={{ fontSize: 13 }}>Where Clog Busterz shows in the Google map pack, by service × town. 🟢 top-3 · 🟡 4–10 · — not found. Last scan: {lastChecked}.</p>

      {cells.length === 0 ? (
        <div className="card">No scans yet — run <code>node scripts/run_rank_scan.cjs</code> (or wait for the weekly cron).</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '4px 0 14px' }}>
            <div className="card" style={{ flex: 1, minWidth: 140 }}><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>Top-3 spots</div><div style={{ fontSize: 24, fontWeight: 800, color: 'var(--green)' }}>{ranking}<span className="muted" style={{ fontSize: 14 }}> / {cells.length}</span></div></div>
            <div className="card" style={{ flex: 1, minWidth: 140 }}><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>Showing at all</div><div style={{ fontSize: 24, fontWeight: 800, color: 'var(--amber)' }}>{present}<span className="muted" style={{ fontSize: 14 }}> / {cells.length}</span></div></div>
            <div className="card" style={{ flex: 1, minWidth: 140 }}><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>Invisible</div><div style={{ fontSize: 24, fontWeight: 800, color: 'var(--red)' }}>{cells.length - present}</div></div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 4, fontSize: 12.5 }}>
              <thead>
                <tr><th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--fg-3)', fontWeight: 600 }}>Keyword</th>
                  {LOCATIONS.map((l) => <th key={l} style={{ padding: '4px 6px', color: 'var(--fg-2)', fontSize: 11, whiteSpace: 'nowrap' }}>{l.split(',')[0]}</th>)}</tr>
              </thead>
              <tbody>
                {KEYWORDS.map((kw) => (
                  <tr key={kw}>
                    <td style={{ padding: '4px 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>{kw}</td>
                    {LOCATIONS.map((loc) => { const c = latest[kw + '|' + loc]; const s = cellColor(c?.found ? c.position : null); return (
                      <td key={loc} style={{ background: s.bg, color: s.fg, textAlign: 'center', fontWeight: 800, borderRadius: 7, padding: '8px 4px', minWidth: 44 }}>{c ? s.t : ''}</td>
                    ); })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="h2" style={{ marginTop: 18 }}>By town</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            {LOCATIONS.map((l) => { const b = byLoc[l]; const pct = b.total ? Math.round(b.present / b.total * 100) : 0; const weak = pct < 40; return (
              <div key={l} className="card" style={{ borderLeft: `3px solid ${weak ? 'var(--red)' : pct < 70 ? 'var(--amber)' : 'var(--green)'}` }}>
                <div style={{ fontWeight: 800 }}>{l.split(',')[0]}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>Showing on {b.present}/{b.total} · {b.top3} in top-3</div>
                {weak && <div style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 4, fontWeight: 600 }}>⚠ Big growth gap here</div>}
              </div>
            ); })}
          </div>
        </>
      )}
    </div>
  );
}
