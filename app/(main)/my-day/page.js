import Link from 'next/link';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import { requireRole } from '@/lib/guard';

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
  await requireRole(['owner', 'tech']);
  const tech = (searchParams?.tech || '').trim();

  if (!isSupabaseConfigured) {
    return (
      <div className="wrap">
        <div className="h1">📋 My Day</div>
        <SetupCard />
      </div>
    );
  }

  const supabase = getSupabase();
  // Reads YOUR real relational schema: jobs link to customers + techs by id.
  const sel = 'id, status, priority, scheduled_at, customers(name, address), techs' + (tech ? '!inner' : '') + '(name)';
  let query = supabase.from('jobs').select(sel).order('scheduled_at', { ascending: true });
  if (tech) query = query.ilike('techs.name', '%' + tech + '%');

  const { data: jobs, error } = await query;

  return (
    <div className="wrap">
      <div className="h1">📋 My Day{tech ? ` · ${tech}` : ''}</div>
      <p className="muted">
        Live from Supabase{tech ? '' : ' · all techs'} ·{' '}
        {tech ? <Link href="/my-day">show everyone</Link> : <span>add <code>?tech=Name</code> to filter</span>}
      </p>

      {error && (
        <div className="notice">
          <strong>Couldn&apos;t load jobs.</strong> {error.message}
          <div style={{ marginTop: 8 }}>
            If the tables are empty, run <code>supabase/seed.sql</code> in the Supabase SQL editor to add
            a few sample jobs, then refresh.
          </div>
        </div>
      )}

      {!error && (!jobs || jobs.length === 0) && (
        <div className="card">
          <span className="muted">
            No jobs yet. Run <code>supabase/seed.sql</code> in Supabase to drop in a few samples, then refresh.
          </span>
        </div>
      )}

      {!error && jobs && jobs.map((j) => {
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
                  {cust.name || 'Customer'}
                  {urgent && <span className="pill" style={{ marginLeft: 8, color: 'var(--red)' }}>URGENT</span>}
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
