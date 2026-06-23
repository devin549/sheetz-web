import Link from 'next/link';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import { can } from '@/lib/roles';

function todayKey() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

// Always read fresh (no static caching) — this is live job data.
export const dynamic = 'force-dynamic';

function fmtTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch { return '—'; }
}

function SetupCard() {
  return (
    <div className="notice">
      <strong>Almost there — connect Supabase.</strong><br />
      This screen reads jobs from your Supabase database, but the keys aren&apos;t set yet. Add
      <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in a
      <code>.env.local</code> file (locally) and in Vercel&apos;s Environment Variables. Steps in
      <code>README.md</code>.
    </div>
  );
}

export default async function MyDay({ searchParams }) {
  const { user, role } = await requireHref('/my-day');

  if (!isAdminConfigured) {
    return (
      <div className="wrap">
        <div className="h1">📋 My Day</div>
        <SetupCard />
      </div>
    );
  }

  const supabase = getSupabaseAdmin();
  const myName = (user.user_metadata && user.user_metadata.name) || '';
  const myEmail = (user.email || '').toLowerCase();
  const seeAll = can(role, 'seeAllJobs');           // owner/dispatcher/csr/gm/om/fs/viewer/sales/marketing/accounting
  const officeFilter = (searchParams?.tech || '').trim();

  // Decide WHOSE jobs this person sees.
  //   seeAll  → everyone (optional ?tech filter)
  //   helper  → the tech they're paired with TODAY (helper_assignments)
  //   else    → their own jobs (field tech / foreman)
  let scopeName = null;     // tech name to filter by (null = all)
  let scopeLabel = '';      // heading suffix
  let subtitle = '';
  let note = null;          // {kind, msg} → show a friendly card instead of jobs

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
      scopeName = pair[0].tech_name;
      scopeLabel = ` · with ${pair[0].tech_name}`;
      subtitle = `riding with ${pair[0].tech_name} today`;
    } else note = { kind: 'helperNone' };
  } else {
    if (!myName) note = { kind: 'noName' };
    else { scopeName = myName; scopeLabel = ` · ${myName}`; subtitle = 'your jobs today'; }
  }

  // Load jobs unless we're showing a note instead.
  let jobs = null, error = null;
  if (!note) {
    const useFilter = !!(scopeName && scopeName.length);
    const sel = 'id, status, priority, scheduled_at, customers(name, address), techs' + (useFilter ? '!inner' : '') + '(name)';
    let query = supabase.from('jobs').select(sel).order('scheduled_at', { ascending: true });
    if (useFilter) query = query.ilike('techs.name', '%' + scopeName + '%');
    const res = await query;
    jobs = res.data; error = res.error;
  }

  return (
    <div className="wrap">
      <div className="h1">📋 My Day{scopeLabel}</div>
      <p className="muted">
        Live from Supabase{subtitle ? ` · ${subtitle}` : ''}
        {seeAll && officeFilter ? <> · <Link href="/my-day">show everyone</Link></> : null}
        {seeAll && !officeFilter ? <> · <span>add <code>?tech=Name</code> to filter</span></> : null}
      </p>

      {note && note.kind === 'helperNone' && (
        <div className="card"><span className="muted">No assignment yet — the office sets who you&apos;re riding with each day. Check back once they pair you up.</span></div>
      )}
      {note && note.kind === 'helperSetup' && (
        <div className="notice"><strong>Helper day isn&apos;t set up yet.</strong> Run <code>supabase/06_helper_assign.sql</code> in Supabase, then the office can pair helpers to techs. <div className="muted" style={{ marginTop: 6, fontSize: 11 }}>{note.msg}</div></div>
      )}
      {note && note.kind === 'noName' && (
        <div className="notice"><strong>Your account has no name set.</strong> Ask the office to add your name on the Team screen so we can match your jobs.</div>
      )}

      {!note && error && (
        <div className="notice">
          <strong>Couldn&apos;t load jobs.</strong> {error.message}
          <div style={{ marginTop: 8 }}>
            If the tables are empty, run <code>supabase/seed.sql</code> in the Supabase SQL editor to add
            a few sample jobs, then refresh.
          </div>
        </div>
      )}

      {!note && !error && (!jobs || jobs.length === 0) && (
        <div className="card">
          <span className="muted">
            {seeAll ? 'No jobs yet. Run supabase/seed.sql in Supabase to drop in a few samples, then refresh.' : 'Nothing on your schedule today. 🎉'}
          </span>
        </div>
      )}

      {!note && !error && jobs && jobs.map((j) => {
        const cust = j.customers || {};
        const t = j.techs || {};
        const done = /done|complete|closed/i.test(j.status || '');
        const urgent = /high|urgent|emergency/i.test(String(j.priority || ''));
        return (
          <div key={j.id} className="card card-amber">
            <div className="job">
              <div className="time">{fmtTime(j.scheduled_at)}</div>
              <div>
                <div className="name">
                  {urgent && <span className="alert-dot" aria-hidden="true" />}
                  {cust.name || 'Customer'}
                  {urgent && <span className="pill pill-red pill-blink" style={{ marginLeft: 8 }}>URGENT</span>}
                </div>
                <div className="meta">
                  {cust.address || 'no address'}
                  {t.name ? ` · ${t.name}` : ''}
                </div>
              </div>
              <span className={'pill' + (done ? ' pill-green' : '')}>{j.status || 'scheduled'}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
