import Link from 'next/link';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import { can } from '@/lib/roles';
import AssignControl from './AssignControl';

export const dynamic = 'force-dynamic';

const START_HOUR = 6, END_HOUR = 19; // 6a–7p, matches the live board
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
const GRID_COLS = `140px repeat(${HOURS.length}, minmax(52px, 1fr))`;

function hourLabel(h) { const ap = h < 12 ? 'a' : 'p'; const hh = h % 12 === 0 ? 12 : h % 12; return `${hh}${ap}`; }
function fmtTime(iso) { try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch { return ''; } }
function money(n) { const v = Number(n || 0); return v >= 1000 ? '$' + (v / 1000).toFixed(1) + 'k' : '$' + Math.round(v); }
function statusColor(s) {
  s = String(s || '').toLowerCase();
  if (/done|complete|closed/.test(s)) return 'var(--green)';
  if (/on_site|onsite/.test(s)) return 'var(--amber)';
  if (/enroute|on_my_way|rolling/.test(s)) return '#ff8a65';
  return 'var(--fg-2)';
}

export default async function Board() {
  const { role } = await requireHref('/board');
  const canAssign = can(role, 'assignJobs');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">🗂️ Dispatch Live</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel to read jobs.</div></div>;
  }
  const sb = getSupabaseAdmin();

  // jobs (graceful if 07/08 columns absent)
  const run = (extra) => sb.from('jobs')
    .select('id, status, priority, scheduled_at, tech_id' + extra + ', customers(name, address), techs(name)')
    .order('scheduled_at', { ascending: true });
  let res = await run(', job_number, job_type, amount, tech_name');
  if (res.error && /column .* does not exist/i.test(res.error.message || '')) res = await run('');
  const jobs = res.data || [];

  // techs, grouped by crew (fallback to a single "Team" if no crew column)
  let tRes = await sb.from('techs').select('id, name, crew').order('name');
  if (tRes.error) tRes = await sb.from('techs').select('id, name').order('name');
  const techRows = tRes.data || [];
  const crews = {};
  techRows.forEach((t) => { const c = t.crew || 'Team'; (crews[c] = crews[c] || []).push(t); });
  const crewNames = Object.keys(crews).sort();

  // place jobs: assigned+scheduled → grid (techId→hour→[]), else → tray
  const grid = {}; const tray = [];
  const now = new Date();
  const tStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tEnd = new Date(tStart.getTime() + 86400000);
  let todayBooked = 0, completedToday = 0;
  const counts = { all: 0, enroute: 0, onsite: 0, scheduled: 0, done: 0 };

  jobs.forEach((j) => {
    const s = String(j.status || '').toLowerCase();
    if (/cancel/.test(s)) return;
    const when = j.scheduled_at ? new Date(j.scheduled_at) : null;
    const isToday = when && when >= tStart && when < tEnd;
    if (isToday) { todayBooked += Number(j.amount) || 0; if (/done|complete|closed/.test(s)) completedToday++; }
    counts.all++;
    if (/on_site|onsite/.test(s)) counts.onsite++;
    else if (/enroute|on_my_way|rolling/.test(s)) counts.enroute++;
    else if (/done|complete|closed/.test(s)) counts.done++;
    else counts.scheduled++;

    if (!j.tech_id || !when) { tray.push(j); return; }
    let h = when.getHours(); if (h < START_HOUR) h = START_HOUR; if (h > END_HOUR) h = END_HOUR;
    ((grid[j.tech_id] = grid[j.tech_id] || {})[h] = (grid[j.tech_id]?.[h] || [])).push(j);
  });
  const nowHour = now.getHours();

  const chip = (label, n, color) => (
    <span className="pill" style={{ fontSize: 11, color: color || 'var(--fg-2)' }}>{label} <strong>{n}</strong></span>
  );

  return (
    <div className="wrap" style={{ maxWidth: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <div className="h1" style={{ margin: 0 }}>🗂️ Dispatch Live</div>
        <span className="muted" style={{ fontSize: 13 }}>{now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
        <Link href="/my-day" className="muted" style={{ fontSize: 13, marginLeft: 'auto' }}>My Day →</Link>
      </div>

      {/* KPI strip */}
      <div className="card card-amber" style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginTop: 10 }}>
        <div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--amber)' }}>{money(todayBooked)}</div><div className="muted" style={{ fontSize: 11 }}>booked today</div></div>
        <div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green-bright)' }}>{completedToday}</div><div className="muted" style={{ fontSize: 11 }}>completed</div></div>
        <div><div style={{ fontSize: 22, fontWeight: 800, color: tray.length ? 'var(--red)' : 'var(--green)', display: 'flex', alignItems: 'center', gap: 6 }}>{tray.length > 0 && <span className="alert-dot" aria-hidden="true" />}{tray.length}</div><div className="muted" style={{ fontSize: 11 }}>in tray</div></div>
        <div><div style={{ fontSize: 22, fontWeight: 800 }}>{techRows.length}</div><div className="muted" style={{ fontSize: 11 }}>techs</div></div>
        <div className="muted" style={{ fontSize: 11, alignSelf: 'center' }}>goal bars + collected $ → wired when the goals/payments tables land</div>
      </div>

      {/* filter chips + view toggles (counts live; filtering/views port next) */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '12px 0' }}>
        {chip('All', counts.all)}
        {chip('🚚 En route', counts.enroute, '#ff8a65')}
        {chip('📍 On site', counts.onsite, 'var(--amber)')}
        {chip('📅 Scheduled', counts.scheduled)}
        {chip('✓ Complete', counts.done, 'var(--green)')}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <span className="pill" style={{ background: 'var(--amber)', color: '#1a1206', fontWeight: 800, fontSize: 11 }}>🗓 Time grid</span>
          <span className="pill" style={{ color: 'var(--fg-3)', fontSize: 11 }}>🗺 Map · soon</span>
          <span className="pill" style={{ color: 'var(--fg-3)', fontSize: 11 }}>👥 Roster · soon</span>
          <span className="pill" style={{ color: 'var(--fg-3)', fontSize: 11 }}>📆 Week · soon</span>
        </span>
      </div>

      {/* TIME GRID */}
      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
        {/* header hours */}
        <div style={{ display: 'grid', gridTemplateColumns: GRID_COLS, borderBottom: '1px solid var(--border)', minWidth: 760 }}>
          <div style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--fg-3)' }}>Tech</div>
          {HOURS.map((h) => (
            <div key={h} style={{ padding: '8px 4px', fontSize: 10, textAlign: 'center', color: h === nowHour ? 'var(--amber)' : 'var(--fg-3)', fontWeight: h === nowHour ? 800 : 400, borderLeft: '1px solid var(--border)' }}>{hourLabel(h)}</div>
          ))}
        </div>

        {crewNames.map((crew) => (
          <div key={crew}>
            <div style={{ padding: '5px 10px', fontSize: 11, fontWeight: 800, color: 'var(--amber-dim)', background: 'var(--surface-1)', borderBottom: '1px solid var(--border)', minWidth: 760 }}>▾ {crew} <span className="muted" style={{ fontWeight: 400 }}>· {crews[crew].length}</span></div>
            {crews[crew].map((t) => (
              <div key={t.id} style={{ display: 'grid', gridTemplateColumns: GRID_COLS, borderBottom: '1px solid var(--border)', minWidth: 760, minHeight: 46 }}>
                <div style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center' }}>{t.name}</div>
                {HOURS.map((h) => {
                  const cell = (grid[t.id] && grid[t.id][h]) || [];
                  return (
                    <div key={h} style={{ borderLeft: '1px solid var(--border)', background: h === nowHour ? 'rgba(217,154,43,.06)' : 'transparent', padding: 2, minWidth: 0 }}>
                      {cell.map((j) => {
                        const cust = (j.customers && j.customers.name) || 'Job';
                        const urgent = /high|urgent|emergency/i.test(String(j.priority || ''));
                        return (
                          <div key={j.id} title={`${cust} · ${fmtTime(j.scheduled_at)}${j.job_type ? ' · ' + j.job_type : ''}`}
                            style={{ background: 'var(--surface-2)', borderLeft: `3px solid ${statusColor(j.status)}`, borderRadius: 4, padding: '3px 5px', marginBottom: 2, fontSize: 10, lineHeight: 1.25, overflow: 'hidden' }}>
                            <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{urgent && <span className="alert-dot" aria-hidden="true" />}{cust}</div>
                            <div className="muted" style={{ fontSize: 9 }}>{fmtTime(j.scheduled_at)}{j.amount ? ' · ' + money(j.amount) : ''}</div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
        {!techRows.length && <div className="muted" style={{ padding: 14, fontSize: 12 }}>No techs yet — add them on the Team screen (role = tech) so they show as rows here.</div>}
      </div>

      {/* JOBS TRAY */}
      <h3 style={{ margin: '20px 0 8px', fontSize: 12, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        🧰 Jobs Tray <span className="muted" style={{ fontWeight: 400 }}>· {tray.length} unscheduled / unassigned</span>
      </h3>
      {!tray.length && <div className="card"><span className="muted">Tray is empty — every job is on a tech&apos;s schedule. 🎉</span></div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
        {tray.map((j) => {
          const cust = (j.customers && j.customers.name) || 'Customer';
          const addr = (j.customers && j.customers.address) || '';
          const urgent = /high|urgent|emergency/i.test(String(j.priority || ''));
          const typeBits = [j.job_type, j.amount ? money(j.amount) : null].filter(Boolean).join(' · ');
          return (
            <div key={j.id} className="card" style={{ borderLeft: `3px solid ${j.tech_id ? 'var(--amber)' : 'var(--red)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{urgent && <span className="alert-dot" aria-hidden="true" />}{cust}</span>
                <span className="muted" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{j.scheduled_at ? fmtTime(j.scheduled_at) : 'no time'}</span>
              </div>
              {addr && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>📍 {addr}</div>}
              {typeBits && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>🔧 {typeBits}</div>}
              {canAssign
                ? <AssignControl jobId={j.id} techs={techRows} currentId={j.tech_id} accent="var(--red)" />
                : <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 5 }}>⚠ needs a tech</div>}
            </div>
          );
        })}
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        Time-grid scheduler · assign from the tray. Next: drag a job onto the grid + live auto-refresh
        (Realtime), then Map / Roster / Week views + goal bars.
      </p>
    </div>
  );
}
