import Link from 'next/link';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import { can } from '@/lib/roles';
import JobCard from './JobCard';
import { deriveTags } from '@/lib/jobTags';
import ShareLocation from './ShareLocation';

// Always read fresh (no static caching) — this is live job data.
export const dynamic = 'force-dynamic';

function todayKey() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
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

  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  // ── Tabs (HTML My Day): 🔥 Today · 📜 My Jobs (30d) · 💰 Today $ ──
  const tab = ['jobs', 'money'].includes(searchParams?.tab) ? searchParams.tab : 'today';
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
            {[['today', `🔥 Today · ${list.length}`], ['jobs', '📜 My Jobs · 30d'], ['money', '💰 Today $']].map(([t, label]) => (
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

      {/* ── 💰 TODAY $ — tech-only earnings (HTML "Today's Money") ── */}
      {!note && !error && tab === 'money' && (
        <>
          <div className="muted" style={{ fontSize: 12, margin: '2px 0 10px' }}>Your day so far · only you see this — hidden when you hand the iPad to a customer.</div>
          <div className="card card-amber" style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>Revenue today</div><div style={{ fontSize: 26, fontWeight: 800, color: 'var(--green-bright)' }}>{money(moneyStats.revenue)}</div></div>
            <div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>Jobs done</div><div style={{ fontSize: 26, fontWeight: 800 }}>{moneyStats.count}</div></div>
            <div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>Avg ticket</div><div style={{ fontSize: 26, fontWeight: 800 }}>{money(moneyStats.avg)}</div></div>
            <div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>Memberships</div><div style={{ fontSize: 26, fontWeight: 800, color: 'var(--amber)' }}>{moneyStats.members}</div></div>
          </div>
          <Link href="/pay" className="pill" style={{ display: 'inline-block', marginTop: 10, color: 'var(--green-bright)', border: '1px solid var(--green-bright)' }}>💵 See your pay + advance →</Link>
          <div className="h2" style={{ marginTop: 16 }}>Where it came from</div>
          {moneyStats.breakdown.length === 0 ? <div className="card muted" style={{ fontSize: 13 }}>Nothing closed yet today.</div> : (
            <div style={{ display: 'grid', gap: 6 }}>
              {moneyStats.breakdown.map((j) => {
                const c = j.customers || {}; const done = isDone(j);
                return (
                  <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <span className="pill" style={{ fontSize: 9.5, color: done ? 'var(--green)' : 'var(--amber)' }}>{done ? '✓ DONE' : '🏠 ON-SITE'}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>{c.name || 'Customer'}{j.job_type ? ` · ${j.job_type}` : ''}</span>
                    <span style={{ fontWeight: 800 }}>{money(j.amount)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

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
