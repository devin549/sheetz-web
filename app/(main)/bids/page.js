import Link from 'next/link';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import { ESTIMATE_OUTCOMES } from '@/lib/qa';

export const dynamic = 'force-dynamic';

const OUTCOME = Object.fromEntries(ESTIMATE_OUTCOMES.map((o) => [o.code, o.label]));
const money = (n) => (n ? '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '');
function fmt(iso) { if (!iso) return ''; try { return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }); } catch { return ''; } }
const hoursSince = (iso) => { try { return Math.floor((Date.now() - Date.parse(iso)) / 3600000); } catch { return 0; } };

export default async function Bids() {
  const { profile } = await requirePerm('changeStatus', 'seeOwnOnly', 'seeCrew', 'seeAllJobs');
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">🧲 Bids</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  const sb = getSupabaseAdmin();

  // This tech's estimate/quote jobs (office with no tech link sees all). Last ~90 days.
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  let q = sb.from('jobs')
    .select('id, job_number, job_type, amount, status, scheduled_at, estimate_outcome, converted_to_job_id, customers(name, phone)')
    .or('job_class.eq.estimate,job_type.ilike.%estimate%,job_type.ilike.%quote%,job_type.ilike.%bid%')
    .gte('scheduled_at', since).order('scheduled_at', { ascending: false }).limit(100);
  if (profile.tech_id) q = q.eq('tech_id', profile.tech_id);
  let res = await q;
  if (res.error) res = await sb.from('jobs').select('id, job_number, job_type, amount, status, scheduled_at, customers(name)').or('job_type.ilike.%estimate%,job_type.ilike.%quote%').limit(50);
  const rows = (res.data || []).map((j) => ({
    id: j.id, customer: (j.customers && j.customers.name) || 'Customer', type: j.job_type || 'Estimate',
    amount: j.amount, when: fmt(j.scheduled_at), age: hoursSince(j.scheduled_at), phone: (j.customers && j.customers.phone) || '',
    outcome: j.estimate_outcome || '', converted: j.converted_to_job_id || '',
  }));

  const needsAction = rows.filter((r) => !r.outcome || ['needs_follow_up', 'needs_parts', 'customer_not_ready'].includes(r.outcome));
  const sold = rows.filter((r) => r.outcome === 'sold_now');
  const notSold = rows.filter((r) => r.outcome === 'not_sold');

  // Follow-up magnet (HTML): un-won + quoted ≥2h = follow up; ≥24h = hands to Sales.
  const Row = (r, magnet) => {
    const tel = String(r.phone || '').replace(/[^0-9+]/g, '');
    const stale = magnet && r.age >= 2, escalating = magnet && r.age >= 24;
    const border = escalating ? 'var(--red)' : stale ? 'var(--amber)' : 'var(--border)';
    return (
      <div key={r.id} className={stale ? 'cb-blink' : ''} style={{ padding: '11px 13px', borderRadius: 10, background: 'var(--surface-2)', border: `1px solid ${border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href={`/job/${r.id}`} style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}>
            <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.customer}</div>
            <div className="muted" style={{ fontSize: 12 }}>{r.type}{r.when ? ` · ${r.when}` : ''}{magnet && r.age ? ` · quoted ${r.age}h ago` : ''}</div>
          </Link>
          {r.amount ? <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>{money(r.amount)}</span> : null}
          {magnet
            ? (escalating ? <span className="pill" style={{ fontSize: 9.5, color: 'var(--red)', border: '1px solid var(--red)' }}>→ SALES</span> : stale ? <span className="pill" style={{ fontSize: 9.5, color: 'var(--amber)', border: '1px solid var(--amber)' }}>⏰ FOLLOW UP</span> : <span className="pill" style={{ fontSize: 9.5, color: 'var(--green)' }}>fresh</span>)
            : <span className="pill" style={{ fontSize: 10, color: r.outcome === 'sold_now' ? 'var(--green)' : 'var(--fg-2)' }}>{r.outcome ? OUTCOME[r.outcome] || r.outcome : 'no outcome'}</span>}
        </div>
        {magnet && tel && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <a href={`sms:${tel}`} className="pill" style={{ color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}>💬 Text</a>
            <a href={`tel:${tel}`} className="pill">📞 Call</a>
          </div>
        )}
      </div>
    );
  };

  const Section = ({ title, items, tint, magnet }) => items.length ? (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: '.05em', color: tint }}>{title}</span>
        <span className="pill" style={{ fontSize: 10 }}>{items.length}</span>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>{items.map((r) => Row(r, magnet))}</div>
    </div>
  ) : null;

  return (
    <div className="wrap" style={{ maxWidth: 620 }}>
      <div className="h1" style={{ marginBottom: 2 }}>🧲 My Bids</div>
      <div className="muted" style={{ fontSize: 13 }}>Quotes you gave that haven’t booked yet. Follow up fast — a quick text wins jobs. No contact in 24h and it goes to the Sales team.</div>
      <Link href="/estimate" className="pill" style={{ display: 'inline-block', margin: '8px 0 4px', color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}>💰 Browse Price Book / build an estimate →</Link>
      {!rows.length && <div className="card" style={{ marginTop: 12 }}><span className="muted">No estimates in the last 90 days. Book one as job class “Estimate / quote”.</span></div>}
      <Section title="Follow up — win these" items={needsAction} tint="var(--amber)" magnet />
      <Section title="Sold" items={sold} tint="var(--green)" />
      <Section title="Not sold" items={notSold} tint="var(--fg-3)" />
    </div>
  );
}
