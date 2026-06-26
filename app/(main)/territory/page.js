import { requirePerm } from '@/lib/guard';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { aggregateTerritory, MIN_JOBS_TO_WATCH, VOLUME_ALERT_PCT } from '@/lib/territory';

export const dynamic = 'force-dynamic';

const trend = (d) => d == null ? { t: 'new', c: 'var(--blue)' } : d >= VOLUME_ALERT_PCT ? { t: `▲ ${d}%`, c: 'var(--green)' } : d <= -VOLUME_ALERT_PCT ? { t: `▼ ${Math.abs(d)}%`, c: 'var(--red)' } : { t: `${d >= 0 ? '+' : ''}${d}%`, c: 'var(--fg-3)' };

export default async function Territory() {
  await requirePerm('seeReports', 'manageUsers', 'seeFinancials', 'seeAllJobs');
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">🗺️ Territory</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;
  const sb = getSupabaseAdmin();

  let jobs = [];
  try { const since = new Date(Date.now() - 60 * 86400000).toISOString(); const { data } = await sb.from('jobs').select('city, address, scheduled_at, customers(city, address)').gte('scheduled_at', since).limit(8000); jobs = data || []; } catch (_) {}
  const areas = aggregateTerritory(jobs);
  const watched = areas.filter((a) => a.watched);
  const swings = areas.filter((a) => a.deltaPct != null && Math.abs(a.deltaPct) >= VOLUME_ALERT_PCT);

  return (
    <div className="wrap" style={{ maxWidth: 820 }}>
      <div className="h1" style={{ marginBottom: 2 }}>🗺️ Territory Intelligence</div>
      <p className="muted" style={{ fontSize: 13 }}>Learned from your jobs: a city becomes a ⭐ watched territory at {MIN_JOBS_TO_WATCH}+ jobs/month, and feeds the rank &amp; competitor scans. Volume = last 30 days vs the 30 before. Alerts at ±{VOLUME_ALERT_PCT}%.</p>

      {areas.length === 0 ? (
        <div className="card" style={{ marginTop: 12 }}><span className="muted">No job locations yet. This lights up as real bookings with addresses flow in (the demo jobs have no city/zip). Booking already captures city/state/zip — once jobs carry an address, your service area and volume trends appear here automatically.</span></div>
      ) : (
        <>
          {swings.length > 0 && (
            <div className="card" style={{ marginTop: 12, borderLeft: '3px solid var(--amber)' }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>🔔 Volume alerts</div>
              {swings.map((a) => { const tr = trend(a.deltaPct); return <div key={a.city} style={{ fontSize: 13, padding: '2px 0' }}><strong>{a.city}</strong> <span style={{ color: tr.c, fontWeight: 700 }}>{tr.t}</span> <span className="muted">· {a.jobs30} this month vs {a.jobsPrev30} prior</span></div>; })}
            </div>
          )}

          <div className="h2" style={{ marginTop: 16 }}>⭐ Watched territories <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>· {watched.length}</span></div>
          {watched.length === 0 ? <div className="muted" style={{ fontSize: 12.5 }}>No city has hit {MIN_JOBS_TO_WATCH} jobs in 30 days yet.</div> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
              {watched.map((a) => { const tr = trend(a.deltaPct); return (
                <div key={a.city} className="card card-amber">
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{a.city}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--amber)', fontFamily: "'JetBrains Mono', monospace" }}>{a.jobs30}<span style={{ fontSize: 12, color: 'var(--fg-3)' }}> jobs/mo</span></div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: tr.c }}>{tr.t} <span className="muted" style={{ fontWeight: 400 }}>vs {a.jobsPrev30} prior</span></div>
                </div>
              ); })}
            </div>
          )}

          <div className="h2" style={{ marginTop: 18 }}>All cities (last 30 days)</div>
          <div style={{ display: 'grid', gap: 4 }}>
            {areas.map((a) => { const tr = trend(a.deltaPct); return (
              <div key={a.city} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13.5 }}>{a.watched ? '⭐ ' : ''}{a.city}</span>
                <span style={{ fontWeight: 700 }}>{a.jobs30}</span>
                <span style={{ minWidth: 60, textAlign: 'right', color: tr.c, fontWeight: 700, fontSize: 12.5 }}>{tr.t}</span>
              </div>
            ); })}
          </div>
        </>
      )}
    </div>
  );
}
