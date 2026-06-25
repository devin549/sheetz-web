import Link from 'next/link';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import { ESTIMATE_OUTCOMES } from '@/lib/qa';

export const dynamic = 'force-dynamic';

const OUTCOME = Object.fromEntries(ESTIMATE_OUTCOMES.map((o) => [o.code, o.label]));
const money = (n) => (n ? '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '');
function fmt(iso) { if (!iso) return ''; try { return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }); } catch { return ''; } }

export default async function Bids() {
  const { profile } = await requirePerm('changeStatus', 'seeOwnOnly', 'seeCrew', 'seeAllJobs');
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">🧲 Bids</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  const sb = getSupabaseAdmin();

  // This tech's estimate/quote jobs (office with no tech link sees all). Last ~90 days.
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  let q = sb.from('jobs')
    .select('id, job_number, job_type, amount, status, scheduled_at, estimate_outcome, converted_to_job_id, customers(name)')
    .or('job_class.eq.estimate,job_type.ilike.%estimate%,job_type.ilike.%quote%,job_type.ilike.%bid%')
    .gte('scheduled_at', since).order('scheduled_at', { ascending: false }).limit(100);
  if (profile.tech_id) q = q.eq('tech_id', profile.tech_id);
  let res = await q;
  if (res.error) res = await sb.from('jobs').select('id, job_number, job_type, amount, status, scheduled_at, customers(name)').or('job_type.ilike.%estimate%,job_type.ilike.%quote%').limit(50);
  const rows = (res.data || []).map((j) => ({
    id: j.id, customer: (j.customers && j.customers.name) || 'Customer', type: j.job_type || 'Estimate',
    amount: j.amount, when: fmt(j.scheduled_at), outcome: j.estimate_outcome || '', converted: j.converted_to_job_id || '',
  }));

  const needsAction = rows.filter((r) => !r.outcome || ['needs_follow_up', 'needs_parts', 'customer_not_ready'].includes(r.outcome));
  const sold = rows.filter((r) => r.outcome === 'sold_now');
  const notSold = rows.filter((r) => r.outcome === 'not_sold');

  const Row = (r) => (
    <Link key={r.id} href={`/job/${r.id}`} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit', padding: '11px 13px' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.customer}</div>
        <div className="muted" style={{ fontSize: 12 }}>{r.type}{r.when ? ` · ${r.when}` : ''}</div>
      </div>
      {r.amount ? <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>{money(r.amount)}</span> : null}
      <span className="pill" style={{ fontSize: 10, color: r.outcome === 'sold_now' ? 'var(--green)' : r.outcome ? 'var(--fg-2)' : 'var(--amber)' }}>{r.outcome ? OUTCOME[r.outcome] || r.outcome : 'no outcome'}</span>
    </Link>
  );

  const Section = ({ title, items, tint }) => items.length ? (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: '.05em', color: tint }}>{title}</span>
        <span className="pill" style={{ fontSize: 10 }}>{items.length}</span>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>{items.map(Row)}</div>
    </div>
  ) : null;

  return (
    <div className="wrap" style={{ maxWidth: 620 }}>
      <div className="h1" style={{ marginBottom: 2 }}>🧲 My Bids</div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>Your estimates — set the outcome on each, and convert the sold ones to work.</div>
      {!rows.length && <div className="card" style={{ marginTop: 12 }}><span className="muted">No estimates in the last 90 days. Book one as job class “Estimate / quote”.</span></div>}
      <Section title="Needs action" items={needsAction} tint="var(--amber)" />
      <Section title="Sold" items={sold} tint="var(--green)" />
      <Section title="Not sold" items={notSold} tint="var(--fg-3)" />
    </div>
  );
}
