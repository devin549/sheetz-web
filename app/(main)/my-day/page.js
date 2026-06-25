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
          {/* tabs — Today is live; the others port next */}
          <div style={{ display: 'flex', gap: 8, margin: '6px 0 12px', flexWrap: 'wrap' }}>
            <span className="pill" style={{ background: 'var(--amber)', color: '#1a1206', fontWeight: 800 }}>🔥 Today · {list.length}</span>
            <span className="pill" style={{ color: 'var(--fg-3)' }}>📋 My Jobs · soon</span>
            <span className="pill" style={{ color: 'var(--fg-3)' }}>💵 Today $ · soon</span>
          </div>

          {/* date summary bar (onsite / upcoming / target) */}
          <div className="card card-amber" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div><div style={{ fontWeight: 800, fontSize: 15 }}>{dateLabel}</div><div className="muted" style={{ fontSize: 11 }}>Today</div></div>
            <div style={{ display: 'flex', gap: 22 }}>
              <div style={{ textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 800, color: stats.onsite ? 'var(--amber)' : 'var(--fg-2)' }}>{stats.onsite}</div><div className="muted" style={{ fontSize: 10 }}>onsite</div></div>
              <div style={{ textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 800 }}>{stats.upcoming}</div><div className="muted" style={{ fontSize: 10 }}>upcoming</div></div>
              <div style={{ textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green-bright)' }}>{money(stats.target)}</div><div className="muted" style={{ fontSize: 10 }}>target</div></div>
            </div>
          </div>
        </>
      )}

      {!note && error && (
        <div className="notice"><strong>Couldn&apos;t load jobs.</strong> {error.message}</div>
      )}

      {!note && !error && list.length === 0 && (
        <div className="card"><span className="muted">{seeAll ? 'No jobs yet. Run supabase/seed.sql to add samples.' : 'Nothing on your schedule today. 🎉'}</span></div>
      )}

      {!note && !error && list.map((j) => {
        const s = String(j.status || '').toLowerCase();
        const variant = j.id === activeJobId ? 'active' : /done|complete|closed|cancel/.test(s) ? 'done' : 'upcoming';
        const tags = deriveTags(j, { member: memberByCust[j.customer_id], vip: vipByCust[j.customer_id], pastDue: pastDueByCust[j.customer_id] });
        return <JobCard key={j.id} job={j} seeAll={seeAll} canAct={can(role, 'changeStatus')} variant={variant} tags={tags} pastDue={pastDueByCust[j.customer_id] || 0} />;
      })}
    </div>
  );
}
