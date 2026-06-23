import Link from 'next/link';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import { can } from '@/lib/roles';
import AssignControl from './AssignControl';
import ScrollToNow from './ScrollToNow';

export const dynamic = 'force-dynamic';

// ── design tokens lifted from the live Dispatch Live board (dispatchboard_data.html) ──
const ACCENT = '#FF6B00';
const STATUS_DOT = {
  scheduled: 'oklch(70% 0.02 240)', enroute: 'oklch(65% 0.14 240)', onsite: 'oklch(62% 0.14 150)',
  hold: 'oklch(72% 0.13 70)', done: 'oklch(55% 0.02 240)', late: 'oklch(68% 0.17 35)',
};
const PRIORITY = { emergency: { short: 'EMG', color: 'oklch(58% 0.20 25)' }, urgent: { short: 'URG', color: 'oklch(70% 0.16 60)' } };
const CREW_COLORS = { 'Drain Team': '#4f9bff', 'Install Crew': '#e0a042', 'HVAC Squad': '#e07a5f' };
const crewColor = (name) => CREW_COLORS[name] || ACCENT;

const START_HOUR = 0, END_HOUR = 23;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const GRID_COLS = `150px repeat(24, minmax(48px, 1fr))`;
const GRID_MIN = 150 + 24 * 48;

function hourLabel(h) { const ap = h < 12 ? 'a' : 'p'; const hh = h % 12 === 0 ? 12 : h % 12; return `${hh}${ap}`; }
function fmtTime(iso) { try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch { return ''; } }
function money(n) { const v = Number(n || 0); return v >= 1000 ? '$' + (v / 1000).toFixed(1) + 'k' : '$' + Math.round(v); }
function initials(name) { return String(name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(); }
function statusKey(s) {
  s = String(s || '').toLowerCase();
  if (/done|complete|closed/.test(s)) return 'done';
  if (/on_site|onsite/.test(s)) return 'onsite';
  if (/enroute|on_my_way|rolling/.test(s)) return 'enroute';
  if (/hold/.test(s)) return 'hold';
  if (/late/.test(s)) return 'late';
  return 'scheduled';
}
function priorityOf(p) {
  const s = String(p || '').toLowerCase();
  if (/emergency/.test(s)) return PRIORITY.emergency;
  if (/high|urgent/.test(s)) return PRIORITY.urgent;
  return null;
}

export default async function Board() {
  const { role } = await requireHref('/board');
  const canAssign = can(role, 'assignJobs');
  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">🗂️ Dispatch Live</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel to read jobs.</div></div>;
  }
  const sb = getSupabaseAdmin();

  const run = (extra) => sb.from('jobs')
    .select('id, status, priority, scheduled_at, tech_id' + extra + ', customers(name, address), techs(name)')
    .order('scheduled_at', { ascending: true });
  let res = await run(', job_number, job_type, amount, tech_name');
  if (res.error && /column .* does not exist/i.test(res.error.message || '')) res = await run('');
  const jobs = res.data || [];

  let tRes = await sb.from('techs').select('id, name, crew').order('name');
  if (tRes.error) tRes = await sb.from('techs').select('id, name').order('name');
  const techRows = tRes.data || [];
  const crews = {};
  techRows.forEach((t) => { const c = t.crew || 'Crew'; (crews[c] = crews[c] || []).push(t); });
  const crewNames = Object.keys(crews).sort();

  // date ranges (CB week = Sun→Sat)
  const now = new Date();
  const tStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tEnd = new Date(tStart.getTime() + 86400000);
  const wStart = new Date(tStart.getTime() - tStart.getDay() * 86400000);
  const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yStart = new Date(now.getFullYear(), 0, 1);

  const grid = {}, tray = [], techStatus = {};
  const kpi = { today: 0, week: 0, month: 0, ytd: 0 };
  const counts = { all: 0, scheduled: 0, enroute: 0, onsite: 0, late: 0, done: 0 };

  jobs.forEach((j) => {
    const sk = statusKey(j.status);
    if (String(j.status || '').toLowerCase().includes('cancel')) return;
    const when = j.scheduled_at ? new Date(j.scheduled_at) : null;
    const amt = Number(j.amount) || 0;
    if (when) {
      if (when >= yStart) kpi.ytd += amt;
      if (when >= mStart) kpi.month += amt;
      if (when >= wStart) kpi.week += amt;
      if (when >= tStart && when < tEnd) kpi.today += amt;
    }
    counts.all++; counts[sk] = (counts[sk] || 0) + 1;
    if (j.tech_id) {
      // a tech's row status = their "hottest" active job
      const cur = techStatus[j.tech_id];
      const rank = { onsite: 3, enroute: 2, late: 2, hold: 1, scheduled: 0, done: -1 };
      if (cur == null || (rank[sk] ?? 0) > (rank[cur] ?? 0)) techStatus[j.tech_id] = sk;
    }
    if (!j.tech_id || !when) { tray.push(j); return; }
    let h = when.getHours();
    ((grid[j.tech_id] = grid[j.tech_id] || {})[h] = (grid[j.tech_id]?.[h] || [])).push(j);
  });
  const nowHour = now.getHours();

  const Dot = ({ k }) => <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_DOT[k] || 'var(--fg-3)', display: 'inline-block' }} />;
  const chip = (label, n, k) => (
    <span className="pill" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      {k && <Dot k={k} />}{label} <strong>{n}</strong>
    </span>
  );
  const Kpi = ({ label, val }) => (
    <div style={{ flex: '1 1 130px', minWidth: 120 }}>
      <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 800, color: ACCENT }}>{money(val)}</div>
      <div style={{ height: 4, borderRadius: 3, background: 'var(--surface-2)', marginTop: 5, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, Math.round((val / (kpi.ytd || 1)) * 100))}%`, height: '100%', background: ACCENT, opacity: 0.7 }} />
      </div>
    </div>
  );

  return (
    <div className="wrap" style={{ maxWidth: 'none' }}>
      {/* chrome */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div className="h1" style={{ margin: 0, color: ACCENT }}>⚡ Dispatch Live</div>
        <span className="muted" style={{ fontSize: 13 }}>{now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <span className="pill" style={{ fontSize: 11 }}><Dot k="onsite" /> ON {counts.onsite}</span>
          <span className="pill" style={{ fontSize: 11 }}><Dot k="enroute" /> EN {counts.enroute}</span>
          <span className="pill" style={{ fontSize: 11, color: tray.length ? 'var(--red)' : undefined }}>🧰 {tray.length}</span>
          <Link href="/my-day" className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>My Day →</Link>
        </span>
      </div>

      {/* KPI cards */}
      <div className="card" style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginTop: 10, borderTop: `2px solid ${ACCENT}` }}>
        <Kpi label="Today" val={kpi.today} />
        <Kpi label="This Week" val={kpi.week} />
        <Kpi label="This Month" val={kpi.month} />
        <Kpi label="YTD" val={kpi.ytd} />
        <div className="muted" style={{ fontSize: 10, alignSelf: 'center', maxWidth: 150 }}>booked $ (bars vs YTD). Goal targets + collected $ wire in with the Settings/payments tables.</div>
      </div>

      {/* filter chips + view toggles */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '12px 0' }}>
        {chip('All', counts.all)}
        {chip('Idle', counts.scheduled, 'scheduled')}
        {chip('En route', counts.enroute, 'enroute')}
        {chip('On site', counts.onsite, 'onsite')}
        {chip('Late', counts.late, 'late')}
        {chip('Complete', counts.done, 'done')}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <span className="pill" style={{ background: ACCENT, color: '#fff', fontWeight: 800, fontSize: 11 }}>Time grid</span>
          {['Map', 'Roster', 'Week', 'Capacity'].map((v) => <span key={v} className="pill" style={{ color: 'var(--fg-3)', fontSize: 11 }}>{v}</span>)}
        </span>
      </div>

      {/* TIME GRID */}
      <ScrollToNow hour={nowHour} totalHours={24} containerId="board-grid" />
      <div id="board-grid" style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: GRID_COLS, borderBottom: '1px solid var(--border)', minWidth: GRID_MIN }}>
          <div style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--fg-3)' }}>Tech</div>
          {HOURS.map((h) => (
            <div key={h} style={{ padding: '8px 2px', fontSize: 10, textAlign: 'center', color: h === nowHour ? ACCENT : 'var(--fg-3)', fontWeight: h === nowHour ? 800 : 400, borderLeft: '1px solid var(--border)' }}>{hourLabel(h)}</div>
          ))}
        </div>

        {crewNames.map((crew) => (
          <div key={crew}>
            <div style={{ padding: '5px 10px', fontSize: 11, fontWeight: 800, background: 'var(--surface-1)', borderBottom: '1px solid var(--border)', borderLeft: `3px solid ${crewColor(crew)}`, minWidth: GRID_MIN }}>
              <span style={{ color: crewColor(crew) }}>▾ {crew}</span> <span className="muted" style={{ fontWeight: 400 }}>· {crews[crew].length}</span>
            </div>
            {crews[crew].map((t) => {
              const st = techStatus[t.id];
              return (
                <div key={t.id} style={{ display: 'grid', gridTemplateColumns: GRID_COLS, borderBottom: '1px solid var(--border)', minWidth: GRID_MIN, minHeight: 48 }}>
                  <div style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 26, height: 26, borderRadius: '50%', background: crewColor(crew), color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials(t.name)}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                      <span style={{ fontSize: 9, display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--fg-3)' }}>{st ? <><Dot k={st} /> {st}</> : 'idle'}</span>
                    </span>
                  </div>
                  {HOURS.map((h) => {
                    const cell = (grid[t.id] && grid[t.id][h]) || [];
                    return (
                      <div key={h} style={{ borderLeft: '1px solid var(--border)', background: h === nowHour ? 'color-mix(in oklab, ' + ACCENT + ' 8%, transparent)' : 'transparent', padding: 2, minWidth: 0 }}>
                        {cell.map((j) => {
                          const cust = (j.customers && j.customers.name) || 'Job';
                          const pr = priorityOf(j.priority);
                          return (
                            <div key={j.id} title={`${cust} · ${fmtTime(j.scheduled_at)}${j.job_type ? ' · ' + j.job_type : ''}`}
                              style={{ background: 'var(--surface-2)', borderLeft: `3px solid ${pr ? pr.color : STATUS_DOT[statusKey(j.status)]}`, borderRadius: 4, padding: '3px 5px', marginBottom: 2, fontSize: 10, lineHeight: 1.25, overflow: 'hidden' }}>
                              <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pr && <span style={{ color: pr.color, fontWeight: 800 }}>{pr.short} </span>}{cust}</div>
                              <div className="muted" style={{ fontSize: 9 }}>{fmtTime(j.scheduled_at)}{j.amount ? ' · ' + money(j.amount) : ''}</div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
        {!techRows.length && <div className="muted" style={{ padding: 14, fontSize: 12 }}>No techs yet — add them on the Team screen (role = tech) so they show as rows here.</div>}
      </div>

      {/* JOBS TRAY */}
      <h3 style={{ margin: '20px 0 8px', fontSize: 12, color: ACCENT, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        🧰 Jobs Tray <span className="muted" style={{ fontWeight: 400 }}>· {tray.length} unscheduled / unassigned</span>
      </h3>
      {!tray.length && <div className="card"><span className="muted">Tray is empty — every job is on a tech&apos;s schedule. 🎉</span></div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
        {tray.map((j) => {
          const cust = (j.customers && j.customers.name) || 'Customer';
          const addr = (j.customers && j.customers.address) || '';
          const pr = priorityOf(j.priority);
          const typeBits = [j.job_type, j.amount ? money(j.amount) : null].filter(Boolean).join(' · ');
          return (
            <div key={j.id} className="card" style={{ borderLeft: `3px solid ${pr ? pr.color : (j.tech_id ? ACCENT : 'var(--red)')}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{pr && <span style={{ color: pr.color, fontWeight: 800 }}>{pr.short} </span>}{cust}</span>
                <span className="muted" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{j.scheduled_at ? fmtTime(j.scheduled_at) : 'no time'}</span>
              </div>
              {addr && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>📍 {addr}</div>}
              {typeBits && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>🔧 {typeBits}</div>}
              {canAssign
                ? <AssignControl jobId={j.id} techs={techRows} currentId={j.tech_id} accent={ACCENT} />
                : <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 5 }}>⚠ needs a tech</div>}
            </div>
          );
        })}
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        Matching the live Dispatch Live board. Still to port: drag-a-job-onto-the-grid, live realtime
        refresh, Map / Roster / Week / Capacity views, trade + skill badges + utilization %, goal bars.
      </p>
    </div>
  );
}
