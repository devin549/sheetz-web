import Link from 'next/link';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import { can } from '@/lib/roles';
import BoardSurface from './BoardSurface';
import LiveClock from './LiveClock';
import DateNav from './DateNav';
import EtaBanner from './EtaBanner';
import BoardCommand from './BoardCommand';
import BoardTargets from './BoardTargets';
import { loadCloseoutBatch } from '@/lib/qa';
import { FIELD_POSITIONS } from '@/lib/positions';
import { ACCENT, statusKey, money } from './boardTokens';

export const dynamic = 'force-dynamic';

// ── Eastern-time day windows (CB runs on America/New_York) ───────────────────
// DST-aware offset (minutes east of UTC, negative for ET) for a given instant.
function nyOffsetMinutes(d) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' })
    .formatToParts(d).find((p) => p.type === 'timeZoneName');
  const m = (part?.value || 'GMT-5').match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);
  if (!m) return -300;
  const h = parseInt(m[1], 10);
  return h * 60 + (h < 0 ? -1 : 1) * parseInt(m[2] || '0', 10);
}
function nyTodayStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}
// UTC [start,end) instants bounding the Eastern calendar day `dateStr` (YYYY-MM-DD).
function nyDayWindow(dateStr) {
  const off = nyOffsetMinutes(new Date(Date.parse(dateStr + 'T12:00:00Z')));
  const startMs = Date.parse(dateStr + 'T00:00:00Z') - off * 60000;
  return { startISO: new Date(startMs).toISOString(), endISO: new Date(startMs + 86400000).toISOString() };
}

export default async function Board({ searchParams }) {
  const { role } = await requireHref('/board');
  const canAssign = can(role, 'assignJobs');
  const canStatus = can(role, 'changeStatus');
  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Dispatch Live</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel to read jobs.</div></div>;
  }
  const sb = getSupabaseAdmin();

  const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(searchParams?.date || '') ? searchParams.date : nyTodayStr();
  const { startISO, endISO } = nyDayWindow(dateStr);
  // jobs scheduled on the selected day, OR with no time yet (the standing backlog the tray works from)
  const dayFilter = `and(scheduled_at.gte.${startISO},scheduled_at.lt.${endISO}),scheduled_at.is.null`;

  const run = (extra) => sb.from('jobs')
    .select('id, status, priority, scheduled_at, tech_id' + extra + ', customers(name, address, phone), techs(name)')
    .or(dayFilter)
    .order('scheduled_at', { ascending: true });
  let res = await run(', job_number, job_type, amount, tech_name, duration_min');
  if (res.error && /column .* does not exist/i.test(res.error.message || '')) res = await run('');
  const rawJobs = res.data || [];

  // Field-assignable roster only — office titles excluded (set on /team). Graceful pre-migration.
  let tRes = await sb.from('techs').select('id, name, crew, position').in('position', FIELD_POSITIONS).order('name');
  if (tRes.error) tRes = await sb.from('techs').select('id, name, crew').order('name');
  if (tRes.error) tRes = await sb.from('techs').select('id, name').order('name');
  const techs = (tRes.data || []).map((t) => ({ id: t.id, name: t.name, crew: t.crew || 'Crew' }));

  // photo counts per job for the card badges (guarded — table may be absent on older DBs)
  const photoCount = {};
  const jobIds = rawJobs.map((j) => j.id);
  if (jobIds.length) {
    const pRes = await sb.from('job_photos').select('job_id').is('deleted_at', null).in('job_id', jobIds);
    if (!pRes.error) (pRes.data || []).forEach((p) => { photoCount[p.job_id] = (photoCount[p.job_id] || 0) + 1; });
  }

  // Open ETA reports (tech said running late, office hasn't handled it). Guarded — table may be absent.
  let etaReports = [];
  const jobInfo = {};
  rawJobs.forEach((j) => { jobInfo[j.id] = { customer: (j.customers && j.customers.name) || 'Customer', phone: (j.customers && j.customers.phone) || '', tech: j.tech_name || (j.techs && j.techs.name) || '' }; });
  if (jobIds.length) {
    const er = await sb.from('job_eta_updates')
      .select('id, job_id, minutes, note, needs_help, new_eta, created_by_name, created_at')
      .in('job_id', jobIds).is('ack_at', null).order('created_at', { ascending: false });
    if (!er.error) etaReports = er.data || [];
  }
  const canContact = can(role, 'contactCustomer');

  // active members → ⭐ badge on the board (match by customer name; graceful if no table)
  const memberNames = new Set();
  try { const { data: mem } = await sb.from('memberships').select('customer').eq('status', 'active'); (mem || []).forEach((m) => { const n = String(m.customer || '').trim().toLowerCase(); if (n) memberNames.add(n); }); } catch (_) { /* ignore */ }

  const gridJobs = [], tray = [], techStatus = {};
  const rank = { onsite: 3, enroute: 2, late: 2, hold: 1, scheduled: 0, done: -1 };
  let dayRevenue = 0;

  rawJobs.forEach((j) => {
    if (String(j.status || '').toLowerCase().includes('cancel')) return;
    const sk = statusKey(j.status);
    const when = j.scheduled_at ? new Date(j.scheduled_at) : null;
    const amt = Number(j.amount) || 0;
    if (when) dayRevenue += amt;
    if (j.tech_id) { const cur = techStatus[j.tech_id]; if (cur == null || (rank[sk] ?? 0) > (rank[cur] ?? 0)) techStatus[j.tech_id] = sk; }

    const base = {
      id: j.id, customer: (j.customers && j.customers.name) || 'Customer', address: (j.customers && j.customers.address) || '',
      phone: (j.customers && j.customers.phone) || '', job_number: j.job_number || '',
      duration_min: j.duration_min || null, photoCount: photoCount[j.id] || 0,
      status: j.status, statusKey: sk, priority: j.priority, amount: amt, job_type: j.job_type || '',
      scheduledISO: j.scheduled_at, techId: j.tech_id || null,
      member: memberNames.has((((j.customers && j.customers.name) || '')).trim().toLowerCase()),
    };
    if (j.tech_id && when) gridJobs.push(base);
    else tray.push(base);
  });

  // Per-job closeout state (powers the job panel + the "needs QA" fire). Guarded internally.
  const closeoutByJob = await loadCloseoutBatch(sb, gridJobs.map((j) => ({ id: j.id, job_type: j.job_type })));
  gridJobs.forEach((j) => { j.closeout = closeoutByJob[j.id] || null; });

  // Today's Fire — what needs attention right now (all real data).
  const nowMs = Date.now();
  const fire = {
    late: gridJobs.filter((j) => !['enroute', 'onsite', 'done'].includes(j.statusKey) && j.scheduledISO && new Date(j.scheduledISO).getTime() < nowMs).length,
    unassigned: tray.filter((j) => !j.techId).length,
    qa: gridJobs.filter((j) => j.closeout && j.closeout.available !== false && (j.closeout.openFails > 0 || (j.statusKey === 'done' && !j.closeout.readyToClose))).length,
    ar90: 0, lowStock: 0,
  };
  const cutoff = new Date(nowMs - 90 * 86400000).toISOString().slice(0, 10);
  const arRes = await sb.from('invoices').select('balance').gt('balance', 0).lt('invoice_date', cutoff).limit(1000);
  if (!arRes.error) fire.ar90 = (arRes.data || []).reduce((s, i) => s + (Number(i.balance) || 0), 0);
  const lsRes = await sb.from('truck_inventory').select('qty, reorder_point').limit(2000);
  if (!lsRes.error) fire.lowStock = (lsRes.data || []).filter((r) => Number(r.qty) <= Number(r.reorder_point || 0)).length;

  // Office goals + the actuals we can compute now (booked / avg ticket / QA holds).
  let goals = [];
  const gRes = await sb.from('office_goals').select('key, label, target, unit, assignee, sort').order('sort');
  if (!gRes.error) goals = gRes.data || [];
  const doneToday = gridJobs.filter((j) => j.statusKey === 'done');
  const avgTicket = doneToday.length ? Math.round(doneToday.reduce((s, j) => s + (j.amount || 0), 0) / doneToday.length) : 0;
  const actuals = { booked_day: Math.round(dayRevenue), avg_ticket: avgTicket, qa_clear: fire.qa };
  // Reviews logged this CB week (Sun→now) → lights up the reviews_week Game Plan gauge. Graceful if no table.
  try {
    const nyNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const weekStart = new Date(nyNow); weekStart.setDate(nyNow.getDate() - nyNow.getDay()); weekStart.setHours(0, 0, 0, 0);
    const rv = await sb.from('reviews').select('id', { count: 'exact', head: true }).gte('created_at', weekStart.toISOString());
    if (!rv.error) actuals.reviews_week = rv.count || 0;
  } catch (_) { /* reviews table not migrated yet */ }
  // Same-day fills — jobs booked AND scheduled for this day (computable straight from jobs).
  try {
    const sd = await sb.from('jobs').select('id', { count: 'exact', head: true })
      .gte('scheduled_at', startISO).lt('scheduled_at', endISO)
      .gte('created_at', startISO).lt('created_at', endISO);
    if (!sd.error) actuals.same_day_fills = sd.count || 0;
  } catch (_) { /* ignore */ }

  return (
    <div className="wrap" style={{ maxWidth: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div className="h1" style={{ margin: 0, color: ACCENT }}>Dispatch Live</div>
        <LiveClock />
        <DateNav date={dateStr} today={nyTodayStr()} />
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 12 }}>Booked: <strong style={{ color: 'var(--green)' }}>{money(dayRevenue)}</strong></span>
          <Link href="/my-day" className="muted" style={{ fontSize: 12 }}>My Day →</Link>
        </span>
      </div>

      <BoardTargets goals={goals} actuals={actuals} />

      <EtaBanner reports={etaReports} jobInfo={jobInfo} canContact={canContact} />

      <BoardCommand fire={fire} role={role} />

      <BoardSurface techs={techs} jobs={gridJobs} tray={tray} techStatus={techStatus} canAssign={canAssign} canStatus={canStatus} dateStr={dateStr} />

      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        Time grid: drag a tray job onto a tech&apos;s row to schedule it (snaps to 15 min); drag a block to move it.
        Switch views above — Map, Roster, Week, Capacity. Next: supervisor QA view, realtime, address-based zones.
      </p>
    </div>
  );
}
