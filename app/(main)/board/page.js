import Link from 'next/link';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import { can } from '@/lib/roles';
import BoardGrid from './BoardGrid';
import LiveClock from './LiveClock';
import { ACCENT, STATUS_DOT, statusKey, money } from './boardTokens';

export const dynamic = 'force-dynamic';

export default async function Board() {
  const { role } = await requireHref('/board');
  const canAssign = can(role, 'assignJobs');
  const canStatus = can(role, 'changeStatus');
  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">⚡ Dispatch Live</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel to read jobs.</div></div>;
  }
  const sb = getSupabaseAdmin();

  const run = (extra) => sb.from('jobs')
    .select('id, status, priority, scheduled_at, tech_id' + extra + ', customers(name, address, phone), techs(name)')
    .order('scheduled_at', { ascending: true });
  let res = await run(', job_number, job_type, amount, tech_name, duration_min');
  if (res.error && /column .* does not exist/i.test(res.error.message || '')) res = await run('');
  const rawJobs = res.data || [];

  let tRes = await sb.from('techs').select('id, name, crew').order('name');
  if (tRes.error) tRes = await sb.from('techs').select('id, name').order('name');
  const techs = (tRes.data || []).map((t) => ({ id: t.id, name: t.name, crew: t.crew || 'Crew' }));

  // date ranges (CB week = Sun→Sat)
  const now = new Date();
  const tStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tEnd = new Date(tStart.getTime() + 86400000);
  const wStart = new Date(tStart.getTime() - tStart.getDay() * 86400000);
  const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yStart = new Date(now.getFullYear(), 0, 1);

  const gridJobs = [], tray = [], techStatus = {};
  const kpi = { today: 0, week: 0, month: 0, ytd: 0 };
  const counts = { all: 0, scheduled: 0, enroute: 0, onsite: 0, late: 0, done: 0 };
  const rank = { onsite: 3, enroute: 2, late: 2, hold: 1, scheduled: 0, done: -1 };

  rawJobs.forEach((j) => {
    if (String(j.status || '').toLowerCase().includes('cancel')) return;
    const sk = statusKey(j.status);
    const when = j.scheduled_at ? new Date(j.scheduled_at) : null;
    const amt = Number(j.amount) || 0;
    if (when) {
      if (when >= yStart) kpi.ytd += amt;
      if (when >= mStart) kpi.month += amt;
      if (when >= wStart) kpi.week += amt;
      if (when >= tStart && when < tEnd) kpi.today += amt;
    }
    counts.all++; counts[sk] = (counts[sk] || 0) + 1;
    if (j.tech_id) { const cur = techStatus[j.tech_id]; if (cur == null || (rank[sk] ?? 0) > (rank[cur] ?? 0)) techStatus[j.tech_id] = sk; }

    const base = {
      id: j.id, customer: (j.customers && j.customers.name) || 'Customer', address: (j.customers && j.customers.address) || '',
      phone: (j.customers && j.customers.phone) || '', job_number: j.job_number || '',
      duration_min: j.duration_min || null,
      status: j.status, statusKey: sk, priority: j.priority, amount: amt, job_type: j.job_type || '', scheduledISO: j.scheduled_at, techId: j.tech_id || null,
    };
    if (j.tech_id && when) gridJobs.push(base);
    else tray.push(base);
  });

  const Dot = ({ k }) => <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_DOT[k] || 'var(--fg-3)', display: 'inline-block' }} />;
  const chip = (label, n, k) => <span className="pill" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}>{k && <Dot k={k} />}{label} <strong>{n}</strong></span>;
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div className="h1" style={{ margin: 0, color: ACCENT }}>⚡ Dispatch Live</div>
        <LiveClock />
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="pill" style={{ fontSize: 11 }}><Dot k="onsite" /> ON {counts.onsite}</span>
          <span className="pill" style={{ fontSize: 11 }}><Dot k="enroute" /> EN {counts.enroute}</span>
          <span className="pill" style={{ fontSize: 11, color: tray.length ? 'var(--red)' : undefined }}>🧰 {tray.length}</span>
          <Link href="/my-day" className="muted" style={{ fontSize: 12 }}>My Day →</Link>
        </span>
      </div>

      <div className="card" style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginTop: 10, borderTop: `2px solid ${ACCENT}` }}>
        <Kpi label="Today" val={kpi.today} />
        <Kpi label="This Week" val={kpi.week} />
        <Kpi label="This Month" val={kpi.month} />
        <Kpi label="YTD" val={kpi.ytd} />
        <div className="muted" style={{ fontSize: 10, alignSelf: 'center', maxWidth: 150 }}>booked $ (bars vs YTD). Goal targets + collected $ wire in with the Settings/payments tables.</div>
      </div>

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

      <BoardGrid techs={techs} jobs={gridJobs} tray={tray} techStatus={techStatus} canAssign={canAssign} canStatus={canStatus} />

      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        Drag a tray job onto a tech&apos;s row to schedule it (snaps to 15 min); drag a block to move it.
        Next: live realtime refresh, Map / Roster / Week views, trade + skill badges + utilization, goal bars.
      </p>
    </div>
  );
}
