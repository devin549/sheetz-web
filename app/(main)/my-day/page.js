import Link from 'next/link';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import { can } from '@/lib/roles';
import JobCard from './JobCard';
import TodayMoney from './TodayMoney';
import WeekView from './WeekView';
import { deriveTags } from '@/lib/jobTags';
import ShareLocation from './ShareLocation';
import { computeJobPay } from '@/lib/pay';

const DAILY_REVENUE_GOAL = 1500; // default tech daily revenue goal for "vs goal" until per-tech goals land

// Always read fresh (no static caching) — this is live job data.
export const dynamic = 'force-dynamic';

// CB runs on Eastern time. The Vercel server clock is UTC, so after ~8pm ET "new Date()" already reads
// tomorrow — compute "today" in CB's timezone so the date + which jobs count as today are correct.
const CB_TZ = 'America/New_York';
function todayKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CB_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function fmtTime(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch { return '—'; }
}
function money(n) { return '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }); }

// Map a raw status to the iPad-style pill.
function statusPill(status) {
  const s = String(status || '').toLowerCase();
  if (/done|complete|closed/.test(s)) return { label: '✓ COMPLETE', cls: 'pill pill-green' };
  if (/on_site|onsite/.test(s)) return { label: '📍 ON-SITE', cls: 'pill', color: 'var(--amber)' };
  if (/enroute|en route|rolling/.test(s)) return { label: '🚚 EN ROUTE', cls: 'pill', color: 'var(--amber)' };
  if (/cancel/.test(s)) return { label: 'CANCELLED', cls: 'pill', color: 'var(--fg-3)' };
  return { label: (status || 'scheduled').toUpperCase(), cls: 'pill' };
}

function SetupCard() {
  return (
    <div className="notice">
      <strong>Almost there — connect Supabase.</strong><br />
      This screen reads jobs from your database, but the keys aren&apos;t set yet. Add
      <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in Vercel&apos;s
      Environment Variables.
    </div>
  );
}

export default async function MyDay({ searchParams }) {
  const { user, role, profile } = await requireHref('/my-day');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">📋 My Day</div><SetupCard /></div>;
  }

  const supabase = getSupabaseAdmin();
  const myName = profile.name || (user.user_metadata && user.user_metadata.name) || '';
  const myEmail = (profile.email || user.email || '').toLowerCase();
  const seeAll = can(role, 'seeAllJobs');
  const officeFilter = (searchParams?.tech || '').trim();

  // Whose jobs: seeAll → everyone; helper → paired tech; else → own.
  let scopeTechId = null, scopeName = null, scopeLabel = '', subtitle = '', note = null;
  if (seeAll) {
    scopeName = officeFilter || null;
    scopeLabel = officeFilter ? ` · ${officeFilter}` : '';
    subtitle = officeFilter ? 'one tech' : 'all techs';
  } else if (role === 'helper') {
    const { data: pair, error: pErr } = await supabase
      .from('helper_assignments').select('tech_name')
      .eq('date_key', todayKey()).ilike('helper_email', myEmail)
      .order('created_at', { ascending: false }).limit(1);
    if (pErr) note = { kind: 'helperSetup', msg: pErr.message };
    else if (pair && pair.length && pair[0].tech_name) {
      scopeName = pair[0].tech_name; scopeLabel = ` · with ${pair[0].tech_name}`; subtitle = `riding with ${pair[0].tech_name} today`;
    } else note = { kind: 'helperNone' };
  } else if (profile.tech_id) {
    // a tech linked to their tech row — scope by tech_id (exact, no name collisions)
    scopeTechId = profile.tech_id; scopeName = myName; scopeLabel = myName ? ` · ${myName}` : ''; subtitle = 'your jobs today';
  } else if (myName) {
    scopeName = myName; scopeLabel = ` · ${myName}`; subtitle = 'your jobs today';
  } else {
    note = { kind: 'noName' };
  }

  // Load jobs (with the new card fields). job_number/job_type/amount may not exist until
  // 07_jobs_card_fields.sql runs — retry without them so the screen never breaks.
  let jobs = null, error = null;
  if (!note) {
    const useName = !scopeTechId && !!(scopeName && scopeName.length);
    const sel = (extra) => 'id, status, priority, scheduled_at, tech_id' + extra + ', customers(name, address, phone), techs' + (useName ? '!inner' : '') + '(name)';
    const run = (extra) => {
      let q = supabase.from('jobs').select(sel(extra)).order('scheduled_at', { ascending: true });
      if (scopeTechId) q = q.eq('tech_id', scopeTechId);
      else if (useName) q = q.ilike('techs.name', '%' + scopeName + '%');
      return q;
    };
    let res = await run(', job_number, job_type, amount, customer_id, job_class, warranty_provider, notes, access_notes, started_at, enroute_at');
    if (res.error) res = await run(', job_number, job_type, amount'); // pre-tag-fields fallback
    if (res.error && /column .* does not exist/i.test(res.error.message || '')) {
      res = await run('');   // 07_jobs_card_fields.sql not run yet — fall back to base columns
    }
    jobs = res.data; error = res.error;
  }

  // High-signal tags need per-customer signals (active membership + open balance). Batch-load both.
  const memberByCust = {}, vipByCust = {}, pastDueByCust = {};
  const custIds = [...new Set((jobs || []).map((j) => j.customer_id).filter(Boolean))];
  if (custIds.length) {
    try { const { data } = await supabase.from('memberships').select('customer_id, status, plan').in('customer_id', custIds); (data || []).forEach((m) => { if (String(m.status || '').toLowerCase() === 'active') { memberByCust[m.customer_id] = true; if (/vip|premium|gold|platinum|elite/i.test(String(m.plan || ''))) vipByCust[m.customer_id] = true; } }); } catch (_) {}
    try { const { data } = await supabase.from('invoices').select('customer_id, balance').in('customer_id', custIds); (data || []).forEach((v) => { const b = Math.max(0, Number(v.balance) || 0); if (b > 0) pastDueByCust[v.customer_id] = (pastDueByCust[v.customer_id] || 0) + b; }); } catch (_) {}
  }
  // The ONE active job = the in-progress one (else the next not-done) — it gets the expanded card.
  const activeJobId = (() => {
    const inProg = (jobs || []).find((j) => /on_?site|enroute|rolling/.test(String(j.status || '').toLowerCase()));
    if (inProg) return inProg.id;
    const next = (jobs || []).find((j) => !/done|complete|closed|cancel/.test(String(j.status || '').toLowerCase()));
    return next ? next.id : null;
  })();

  // Date-bar stats (mirrors cbTia_computeDayStats_): onsite / upcoming / $ still to earn.
  const list = jobs || [];
  const stats = list.reduce((a, j) => {
    const s = String(j.status || '').toLowerCase();
    const done = /done|complete|closed|cancel/.test(s);
    const on = /on_site|onsite|enroute|rolling/.test(s);
    if (on) a.onsite++; else if (!done) a.upcoming++;
    if (!done) a.target += Number(j.amount) || 0;
    return a;
  }, { onsite: 0, upcoming: 0, target: 0 });

  const dateLabel = new Date().toLocaleDateString('en-US', { timeZone: CB_TZ, weekday: 'short', month: 'short', day: 'numeric' });

  // ── Tabs (HTML My Day): 🔥 Today · 📜 My Jobs (30d) · 💰 Today $ ──
  const tab = ['jobs', 'money', 'week'].includes(searchParams?.tab) ? searchParams.tab : 'today';
  const isDone = (j) => /done|complete|closed/.test(String(j.status || '').toLowerCase());
  const isLive = (j) => /on_site|onsite|enroute|rolling/.test(String(j.status || '').toLowerCase());
  // Today $ — tech-only earnings sub-view.
  const doneToday = list.filter(isDone);
  const moneyStats = {
    revenue: list.filter((j) => isDone(j) || isLive(j)).reduce((s, j) => s + (Number(j.amount) || 0), 0),
    booked: doneToday.reduce((s, j) => s + (Number(j.amount) || 0), 0),
    count: doneToday.length,
    avg: doneToday.length ? Math.round(doneToday.reduce((s, j) => s + (Number(j.amount) || 0), 0) / doneToday.length) : 0,
    members: list.filter((j) => memberByCust[j.customer_id]).length,
    breakdown: list.filter((j) => isDone(j) || isLive(j)),
  };
  // 💰 Today $ — compute per-job commission via the real pay engine when the tech is linked to a pay
  // profile. Falls back gracefully (revenue/jobs/avg still show) when there's no link.
  let moneyProps = null;
  if (tab === 'money' && !note) {
    let commissionPct = 0, payKnown = false;
    if (profile.tech_id) {
      try {
        const { data } = await supabase.from('pay_profiles').select('commission_pct, pay_type').eq('tech_id', profile.tech_id).maybeSingle();
        if (data && (data.pay_type === 'commission' || data.pay_type === 'hourly_comm')) { commissionPct = Number(data.commission_pct) || 0; payKnown = commissionPct > 0; }
      } catch (_) {}
    }
    const costById = {};
    const ids = list.map((j) => j.id);
    if (ids.length) { try { const { data } = await supabase.from('jobs').select('id, material_cost_cents, dispatch_fee_cents, sub_cost_cents, sub_verified').in('id', ids); (data || []).forEach((x) => { costById[x.id] = x; }); } catch (_) {} }
    const payDollars = (j) => { const c = costById[j.id] || {}; const p = computeJobPay({ revenue_cents: Math.round((Number(j.amount) || 0) * 100), material_cost_cents: c.material_cost_cents, dispatch_fee_cents: c.dispatch_fee_cents, sub_cost_cents: c.sub_cost_cents, sub_verified: c.sub_verified }, commissionPct); return p.jobPay / 100; };
    const breakdown = moneyStats.breakdown.map((j) => ({ id: j.id, name: (j.customers || {}).name || 'Customer', jobType: j.job_type || '', jobNumber: j.job_number ? `#${j.job_number}` : '', time: j.scheduled_at, amount: Number(j.amount) || 0, commission: payDollars(j), live: isLive(j) }));
    const paySoFar = doneToday.reduce((s, j) => s + payDollars(j), 0);
    const justJob = moneyStats.breakdown.find((j) => isLive(j)) || doneToday[doneToday.length - 1] || null;
    const justNow = justJob ? { amount: Number(justJob.amount) || 0, name: (justJob.customers || {}).name || 'Customer', jobNumber: justJob.job_number ? `#${justJob.job_number}` : '' } : null;
    // vs-goal only makes sense for ONE tech against their daily goal — not the owner's all-techs total.
    const vsGoalPct = (!seeAll && DAILY_REVENUE_GOAL > 0) ? Math.round((moneyStats.revenue / DAILY_REVENUE_GOAL - 1) * 100) : null;
    moneyProps = {
      revenue: moneyStats.revenue, justNow, paySoFar, payKnown,
      jobsDone: moneyStats.count, avgTicket: moneyStats.avg, vsGoalPct, memberships: moneyStats.members,
      breakdown, opportunity: stats.target, dailyRevenue: moneyStats.revenue, payHref: '/pay',
    };
  }

  // 📅 Week — this CB week (Sun 00:00 → Sat 23:59), the tech's jobs grouped by day + weekly totals.
  let weekProps = null;
  if (tab === 'week' && !note) {
    const now = new Date();
    const weekStart = new Date(now); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(now.getDate() - now.getDay()); // back to Sunday
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 7);
    const todayK = todayKey();
    let commissionPct = 0, payKnown = false;
    if (profile.tech_id) {
      try { const { data } = await supabase.from('pay_profiles').select('commission_pct, pay_type').eq('tech_id', profile.tech_id).maybeSingle(); if (data && (data.pay_type === 'commission' || data.pay_type === 'hourly_comm')) { commissionPct = Number(data.commission_pct) || 0; payKnown = commissionPct > 0; } } catch (_) {}
    }
    let wjobs = [];
    const wsel = (extra) => 'id, job_number, job_type, amount, status, scheduled_at, started_at, completed_at' + extra + ', customers(name)';
    const wrun = (extra) => { let q = supabase.from('jobs').select(wsel(extra)).gte('scheduled_at', weekStart.toISOString()).lt('scheduled_at', weekEnd.toISOString()).order('scheduled_at', { ascending: true }); if (scopeTechId) q = q.eq('tech_id', scopeTechId); else if (scopeName) q = q.ilike('tech_name', '%' + scopeName + '%'); return q; };
    let wr = await wrun(', material_cost_cents, dispatch_fee_cents, sub_cost_cents, sub_verified');
    if (wr.error) wr = await wrun(''); // pre-cost-cols fallback
    wjobs = wr.error ? [] : (wr.data || []);
    const isDoneJ = (j) => /done|complete|closed/.test(String(j.status || '').toLowerCase());
    const isLiveJ = (j) => /on_site|onsite|enroute|rolling/.test(String(j.status || '').toLowerCase());
    const payOf = (j) => { const p = computeJobPay({ revenue_cents: Math.round((Number(j.amount) || 0) * 100), material_cost_cents: j.material_cost_cents, dispatch_fee_cents: j.dispatch_fee_cents, sub_cost_cents: j.sub_cost_cents, sub_verified: j.sub_verified }, commissionPct); return p.jobPay / 100; };
    // group by local day
    const byDay = new Map();
    let hours = 0;
    for (const j of wjobs) {
      const d = j.scheduled_at ? new Date(j.scheduled_at) : new Date();
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const done = isDoneJ(j), live = isLiveJ(j);
      const row = { id: j.id, time: j.scheduled_at, jobNumber: j.job_number ? `#${j.job_number}` : '', name: (j.customers || {}).name || 'Customer', jobType: j.job_type || '', amount: Number(j.amount) || 0, commission: payOf(j), live, done, statusLabel: String(j.status || 'scheduled').toUpperCase() };
      if (j.started_at && j.completed_at) { const h = (Date.parse(j.completed_at) - Date.parse(j.started_at)) / 3.6e6; if (h > 0 && h < 24) hours += h; }
      if (!byDay.has(key)) byDay.set(key, { key, label: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }), isToday: key === todayK, jobs: [], total: 0 });
      const g = byDay.get(key); g.jobs.push(row); if (done || live) g.total += row.amount;
    }
    const days = [...byDay.values()];
    const doneW = wjobs.filter(isDoneJ);
    const revenue = wjobs.filter((j) => isDoneJ(j) || isLiveJ(j)).reduce((s, j) => s + (Number(j.amount) || 0), 0);
    const stats = { jobs: wjobs.length, hours: hours ? Math.round(hours) : 0, revenue, pay: doneW.reduce((s, j) => s + payOf(j), 0), avg: doneW.length ? Math.round(revenue / doneW.length) : 0, rating: 0 };
    const weekLabel = `Week of ${weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} — ${new Date(weekEnd.getTime() - 864e5).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    weekProps = { weekLabel, stats, days, payKnown };
  }

  // My Jobs (last 30d) — loaded only on that tab.
  let jobs30 = [];
  if (tab === 'jobs' && !note) {
    try {
      const since = new Date(Date.now() - 30 * 864e5).toISOString();
      let q = supabase.from('jobs').select('id, job_number, job_type, amount, status, scheduled_at, customers(name)').gte('scheduled_at', since).order('scheduled_at', { ascending: false }).limit(60);
      if (scopeTechId) q = q.eq('tech_id', scopeTechId); else if (scopeName) q = q.ilike('tech_name', '%' + scopeName + '%');
      const r = await q; jobs30 = r.error ? [] : (r.data || []);
    } catch (_) {}
  }
  const tabHref = (t) => `/my-day${t === 'today' ? '' : `?tab=${t}`}`;

  return (
    <div className="wrap">
      <div className="h1">📋 My Day{scopeLabel}</div>
      <p className="muted">
        Live from Supabase{subtitle ? ` · ${subtitle}` : ''}
        {seeAll && officeFilter ? <> · <Link href="/my-day">show everyone</Link></> : null}
        {seeAll && !officeFilter ? <> · add <code>?tech=Name</code> to filter</> : null}
      </p>

      {note && note.kind === 'helperNone' && (
        <div className="card"><span className="muted">No assignment yet — the office sets who you&apos;re riding with each day.</span></div>
      )}
      {note && note.kind === 'helperSetup' && (
        <div className="notice"><strong>Helper day isn&apos;t set up yet.</strong> Run <code>supabase/06_helper_assign.sql</code> in Supabase. <div className="muted" style={{ marginTop: 6, fontSize: 11 }}>{note.msg}</div></div>
      )}
      {note && note.kind === 'noName' && (
        <div className="notice"><strong>Your account has no name set.</strong> Ask the office to add your name on the Team screen.</div>
      )}

      {!note && <ShareLocation />}

      {!note && (
        <>
          {/* tabs — 🔥 Today · 📜 My Jobs (30d) · 💰 Today $ (all live) */}
          <div style={{ display: 'flex', gap: 8, margin: '6px 0 12px', flexWrap: 'wrap' }}>
            {[['today', `🔥 Today · ${list.length}`], ['week', '📅 Week'], ['jobs', '📜 My Jobs · 30d'], ['money', '💰 Today $']].map(([t, label]) => (
              <Link key={t} href={tabHref(t)} className="pill" style={{ textDecoration: 'none', fontWeight: tab === t ? 800 : 600, background: tab === t ? 'var(--amber)' : 'var(--surface-2)', color: tab === t ? '#1a1206' : 'var(--fg-2)', border: '1px solid var(--border)' }}>{label}</Link>
            ))}
          </div>

          {tab === 'today' && (<>
            {/* date summary bar (onsite / upcoming / target) */}
            <div className="card card-amber" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
              <div><div style={{ fontWeight: 800, fontSize: 15 }}>{dateLabel}</div><div className="muted" style={{ fontSize: 11 }}>Today</div></div>
              <div style={{ display: 'flex', gap: 22 }}>
                <div style={{ textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 800, color: stats.onsite ? 'var(--amber)' : 'var(--fg-2)' }}>{stats.onsite}</div><div className="muted" style={{ fontSize: 10 }}>onsite</div></div>
                <div style={{ textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 800 }}>{stats.upcoming}</div><div className="muted" style={{ fontSize: 10 }}>upcoming</div></div>
                <div style={{ textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green-bright)' }}>{money(stats.target)}</div><div className="muted" style={{ fontSize: 10 }}>target</div></div>
              </div>
            </div>
            {/* 🧠 Ask Hank (HTML My Day) — Hank knows the tech's numbers */}
            <Link href="/hank" className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit', marginTop: 10, borderLeft: '3px solid var(--purple, #9c64f4)' }}>
              <span style={{ fontSize: 22 }}>🧠</span>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 800, fontSize: 13 }}>Ask Hank</div><div className="muted" style={{ fontSize: 12 }}>“What’s my most profitable job this month?” · Hank knows your numbers</div></div>
              <span style={{ color: 'var(--amber)', fontWeight: 800 }}>›</span>
            </Link>
          </>)}
        </>
      )}

      {!note && error && (
        <div className="notice"><strong>Couldn&apos;t load jobs.</strong> {error.message}</div>
      )}

      {/* ── 🔥 TODAY — the live job list ── */}
      {!note && !error && tab === 'today' && list.length === 0 && (
        <div className="card"><span className="muted">{seeAll ? 'No jobs yet. Run supabase/seed.sql to add samples.' : 'Nothing on your schedule today. 🎉'}</span></div>
      )}
      {!note && !error && tab === 'today' && list.map((j) => {
        const s = String(j.status || '').toLowerCase();
        const variant = j.id === activeJobId ? 'active' : /done|complete|closed|cancel/.test(s) ? 'done' : 'upcoming';
        const tags = deriveTags(j, { member: memberByCust[j.customer_id], vip: vipByCust[j.customer_id], pastDue: pastDueByCust[j.customer_id] });
        return <JobCard key={j.id} job={j} seeAll={seeAll} canAct={can(role, 'changeStatus')} variant={variant} tags={tags} pastDue={pastDueByCust[j.customer_id] || 0} />;
      })}

      {/* ── 📅 WEEK — this week's jobs grouped by day (ported from HTML "My Jobs" weekly view) ── */}
      {!note && !error && tab === 'week' && weekProps && <WeekView {...weekProps} />}

      {/* ── 💰 TODAY $ — tech-only earnings (ported from HTML "Today's Money") ── */}
      {!note && !error && tab === 'money' && moneyProps && <TodayMoney {...moneyProps} />}

      {/* ── 📜 MY JOBS — last 30 days ── */}
      {!note && !error && tab === 'jobs' && (
        jobs30.length === 0 ? <div className="card muted" style={{ fontSize: 13 }}>No jobs in the last 30 days.</div> : (
          <div style={{ display: 'grid', gap: 6 }}>
            {jobs30.map((j) => {
              const c = j.customers || {}; const done = isDone(j);
              return (
                <Link key={j.id} href={`/job/${j.id}`} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
                  <span className="muted" style={{ fontSize: 11, minWidth: 56 }}>{j.scheduled_at ? new Date(j.scheduled_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}</span>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 700 }}>{c.name || 'Customer'}</div><div className="muted" style={{ fontSize: 11.5 }}>{j.job_type || 'Job'}{j.job_number ? ` · #${j.job_number}` : ''}</div></div>
                  {j.amount ? <span style={{ fontWeight: 700, color: 'var(--green-bright)' }}>{money(j.amount)}</span> : null}
                  <span className="pill" style={{ fontSize: 9, color: done ? 'var(--green)' : 'var(--fg-3)' }}>{(j.status || '').toUpperCase()}</span>
                </Link>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
