import Link from 'next/link';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import { ESTIMATE_OUTCOMES } from '@/lib/qa';
import BidActions from './BidActions';

const ESCALATE_H = 24; // no contact in 24h → hands to Sales (tech forfeits the 5%)

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
  const buildQ = (cols) => {
    let q = sb.from('jobs').select(cols)
      .or('job_class.eq.estimate,job_type.ilike.%estimate%,job_type.ilike.%quote%,job_type.ilike.%bid%')
      .gte('scheduled_at', since).order('scheduled_at', { ascending: false }).limit(100);
    if (profile.tech_id) q = q.eq('tech_id', profile.tech_id);
    return q;
  };
  let res = await buildQ('id, job_number, job_type, amount, status, scheduled_at, estimate_outcome, converted_to_job_id, bid_contacted_at, bid_contacted_by, bid_contact_method, customers(name, phone)');
  if (res.error && /bid_contacted|column|schema cache/i.test(res.error.message || '')) res = await buildQ('id, job_number, job_type, amount, status, scheduled_at, estimate_outcome, converted_to_job_id, customers(name, phone)'); // pre-100
  if (res.error) res = await sb.from('jobs').select('id, job_number, job_type, amount, status, scheduled_at, customers(name)').or('job_type.ilike.%estimate%,job_type.ilike.%quote%').limit(50);
  const rows = (res.data || []).map((j) => ({
    id: j.id, customer: (j.customers && j.customers.name) || 'Customer', type: j.job_type || 'Estimate',
    amount: j.amount, when: fmt(j.scheduled_at), age: hoursSince(j.scheduled_at), phone: (j.customers && j.customers.phone) || '',
    outcome: j.estimate_outcome || '', converted: j.converted_to_job_id || '',
    contactedAt: j.bid_contacted_at || '', contactedBy: j.bid_contacted_by || '', contactMethod: j.bid_contact_method || '',
  }));

  const needsAction = rows.filter((r) => !r.outcome || ['needs_follow_up', 'needs_parts', 'customer_not_ready'].includes(r.outcome));
  const sold = rows.filter((r) => r.outcome === 'sold_now');
  const notSold = rows.filter((r) => r.outcome === 'not_sold');

  // Follow-up magnet (HTML): fresh → due (≥2h) → escalated to Sales (≥24h, no contact). Logging a contact
  // flips it to "✓ FOLLOWED UP · your 5% is safe" and stops the clock (Devin's commission rule).
  const Row = (r, magnet) => {
    const contacted = !!r.contactedAt;
    const escalated = magnet && !contacted && r.age >= ESCALATE_H;
    const due = magnet && !contacted && r.age >= 2 && r.age < ESCALATE_H;
    const hrsLeft = Math.max(0, Math.round(ESCALATE_H - r.age));
    const border = escalated ? 'var(--red)' : contacted ? 'var(--green)' : due ? 'var(--amber)' : 'var(--border)';
    // Commission stakes line.
    const comm = !magnet ? null
      : escalated ? { c: '#ff8a80', t: '💸 You forfeited your 5% — Sales gets it if they close it.' }
      : contacted ? { c: 'var(--green)', t: '💵 Your 5% is safe — keep working it to close.' }
      : due ? { c: 'var(--amber)', t: '💸 Follow up or you LOSE your 5% — Sales gets it if they close it.' }
      : null;
    const sub = !magnet ? '' : escalated ? 'Sales has it now' : contacted ? `You followed up — nice. Sales won’t touch it.${r.contactMethod ? ` (${r.contactMethod})` : ''}` : due ? `Hands to Sales in ~${hrsLeft}h if no contact` : 'Fresh — follow up early to lock your 5%';
    return (
      <div key={r.id} className={due ? 'cb-blink' : ''} style={{ padding: '11px 13px', borderRadius: 10, background: 'var(--surface-2)', border: `1px solid ${border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href={`/job/${r.id}`} style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}>
            <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.customer}</div>
            <div className="muted" style={{ fontSize: 12 }}>{r.type}{r.when ? ` · ${r.when}` : ''}{magnet && r.age ? ` · quoted ${r.age < 1 ? '<1' : r.age}h ago` : ''}</div>
          </Link>
          {r.amount ? <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>{money(r.amount)}</span> : null}
          {magnet
            ? (escalated ? <span className="pill" style={{ fontSize: 9.5, color: 'var(--red)', border: '1px solid var(--red)' }}>→ SALES</span> : contacted ? <span className="pill" style={{ fontSize: 9.5, color: 'var(--green)', border: '1px solid var(--green)' }}>✓ FOLLOWED UP</span> : due ? <span className="pill" style={{ fontSize: 9.5, color: 'var(--amber)', border: '1px solid var(--amber)' }}>🔔 FOLLOW UP NOW</span> : <span className="pill" style={{ fontSize: 9.5, color: 'var(--green)' }}>fresh</span>)
            : <span className="pill" style={{ fontSize: 10, color: r.outcome === 'sold_now' ? 'var(--green)' : 'var(--fg-2)' }}>{r.outcome ? OUTCOME[r.outcome] || r.outcome : 'no outcome'}</span>}
        </div>
        {sub && <div style={{ fontSize: 10.5, color: escalated ? '#ff9800' : 'var(--fg-3)', marginTop: 4 }}>{sub}</div>}
        {comm && <div style={{ fontSize: 11, fontWeight: 800, color: comm.c, marginTop: 5 }}>{comm.t}</div>}
        {magnet && !contacted && !escalated && <BidActions jobId={r.id} phone={r.phone} />}
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
      <div className="muted" style={{ fontSize: 13 }}>Quotes you gave that haven’t booked yet. Follow up and log it — the bid stays <strong>yours</strong> and you keep your <strong>5%</strong>. No contact in 24h and it hands to Sales (you forfeit the 5%).</div>
      <Link href="/estimate" className="pill" style={{ display: 'inline-block', margin: '8px 0 4px', color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}>💰 Browse Price Book / build an estimate →</Link>
      {!rows.length && <div className="card" style={{ marginTop: 12 }}><span className="muted">No estimates in the last 90 days. Book one as job class “Estimate / quote”.</span></div>}
      <Section title="Follow up — win these" items={needsAction} tint="var(--amber)" magnet />
      <Section title="Sold" items={sold} tint="var(--green)" />
      <Section title="Not sold" items={notSold} tint="var(--fg-3)" />
    </div>
  );
}
