import Link from 'next/link';

// 📜 My Jobs (last 30d) — exact port of the HTML myDaySub_jobs: a week-summary header, period filter
// pills, and rich grouped-by-day rows (status chip · hours · photos · badges · $ + your pay). Server
// component; data is assembled in page.js. Pay/rating only show when scoped to ONE tech (not all-techs).
const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const money2 = (n) => '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtTime = (iso) => { if (!iso) return ''; try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };

const RANGES = [['week', 'This Week'], ['lastweek', 'Last Week'], ['month', 'This Month'], ['all', 'All Time']];

function chip(status) {
  const s = String(status || '').toLowerCase();
  if (/done|complete|closed/.test(s)) return { t: '✓ DONE', bg: 'rgba(46,125,50,.16)', fg: 'var(--green)', bd: 'var(--green)' };
  if (/on_?site/.test(s)) return { t: '🏠 ON-SITE', bg: 'rgba(255,179,0,.16)', fg: 'var(--amber)', bd: 'var(--amber)' };
  if (/enroute|rolling/.test(s)) return { t: '🚗 EN ROUTE', bg: 'rgba(255,179,0,.16)', fg: 'var(--amber)', bd: 'var(--amber)' };
  if (/cancel/.test(s)) return { t: 'CANCELLED', bg: 'var(--surface-2)', fg: 'var(--fg-3)', bd: 'var(--border-strong)' };
  if (/hold/.test(s)) return { t: 'HOLD', bg: 'var(--surface-2)', fg: 'var(--fg-2)', bd: 'var(--border-strong)' };
  return { t: 'SCHEDULED', bg: 'var(--surface-2)', fg: 'var(--fg-2)', bd: 'var(--border-strong)' };
}

function Stat({ v, label, tone }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 800, color: tone || 'var(--fg-1)' }}>{v}</div>
      <div className="muted" style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
    </div>
  );
}

export default function MyJobs({ range = 'week', summary = {}, groups = [], total = 0, payKnown = false, scoped = false }) {
  return (
    <div>
      {/* WEEK / PERIOD SUMMARY */}
      <div className="card card-amber" style={{ background: 'linear-gradient(135deg, color-mix(in oklab, var(--amber) 14%, var(--surface-1)), var(--surface-1))' }}>
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--amber-dim)', marginBottom: 8 }}>{summary.periodLabel || 'This week'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${scoped ? 6 : 4}, 1fr)`, gap: 12 }}>
          <Stat v={summary.jobs ?? 0} label="Jobs" />
          <Stat v={summary.hours != null ? `${summary.hours}h` : '—'} label="Hours" />
          <Stat v={money(summary.revenue || 0)} label="Revenue" tone="var(--green-bright)" />
          {scoped && <Stat v={payKnown ? money(summary.pay || 0) : '—'} label="Your Pay" tone="var(--amber)" />}
          <Stat v={money(summary.avg || 0)} label="Avg Ticket" tone="var(--amber)" />
          {scoped && <Stat v={summary.rating != null ? `${summary.rating}★` : '—'} label="Rating" tone="var(--amber)" />}
        </div>
      </div>

      {/* FILTER PILLS */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', margin: '12px 0' }}>
        {RANGES.map(([k, label]) => {
          const on = k === range;
          return (
            <Link key={k} href={`/my-day?tab=jobs${k === 'week' ? '' : `&range=${k}`}`} className="pill" style={{ textDecoration: 'none', fontWeight: on ? 800 : 600, fontSize: 12, background: on ? 'var(--amber)' : 'var(--surface-2)', color: on ? '#1a1206' : 'var(--fg-2)', border: '1px solid var(--border)' }}>
              {label}{summary.counts && summary.counts[k] != null ? ` (${summary.counts[k]})` : ''}
            </Link>
          );
        })}
        {summary.issues > 0 && (
          <Link href={`/my-day?tab=jobs&range=${range}&issues=1`} className="pill" style={{ textDecoration: 'none', fontWeight: 700, fontSize: 12, background: 'rgba(198,40,40,.10)', color: 'var(--red)', border: '1px solid var(--red)' }}>⚠ Issues ({summary.issues})</Link>
        )}
      </div>

      {/* GROUPED ROWS */}
      {groups.length === 0 ? (
        <div className="card muted" style={{ fontSize: 13 }}>No jobs in this period.</div>
      ) : groups.map((g) => (
        <div key={g.dayKey} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--fg-2)', textTransform: 'uppercase', letterSpacing: '.04em', margin: '0 0 7px', display: 'flex', alignItems: 'center', gap: 6 }}>
            📅 {g.label}{g.isToday ? <span style={{ color: 'var(--amber)' }}> · Today</span> : null}{g.resetBoundary ? <span className="muted" style={{ fontWeight: 600 }}> · weekly reset boundary</span> : null}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {g.rows.map((r) => {
              const c = chip(r.status);
              return (
                <Link key={r.id} href={`/job/${r.id}`} className="card" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center', padding: '10px 13px', textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ textAlign: 'center', minWidth: 46 }}>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 700 }}>{r.time || '—'}</div>
                    {r.jobNumber ? <div className="muted" style={{ fontSize: 9.5, fontFamily: 'monospace' }}>{r.jobNumber}</div> : null}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 8, background: c.bg, color: c.fg, border: `1px solid ${c.bd}` }}>{c.t}</span>
                      <span style={{ fontWeight: 700, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.customer}</span>
                      {r.type ? <span className="muted" style={{ fontSize: 12 }}>· {r.type}</span> : null}
                    </div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {r.hours != null && <span>{r.hours}h</span>}
                      {r.photos > 0 && <span>📷 {r.photos}</span>}
                      {(r.badges || []).map((b, i) => <span key={i} style={{ color: b.tone || 'var(--fg-3)', fontWeight: 700 }}>{b.label}</span>)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {r.amount ? <span style={{ fontWeight: 800, fontSize: 13.5 }}>{money2(r.amount)}</span> : <span className="muted" style={{ fontSize: 12 }}>{/on_?site|scheduled|enroute/.test(String(r.status).toLowerCase()) ? 'pending' : ''}</span>}
                    {payKnown && r.pay > 0 ? <span style={{ marginLeft: 8, color: 'var(--green-bright)', fontWeight: 700, fontSize: 12.5 }}>+{money2(r.pay)}</span> : null}
                    <span style={{ color: 'var(--amber)', fontWeight: 800, marginLeft: 8 }}>›</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      {total > 0 && (
        <div className="muted" style={{ fontSize: 11, textAlign: 'center', marginTop: 4 }}>{total} job{total === 1 ? '' : 's'} in this period · synced from the job board</div>
      )}
    </div>
  );
}
