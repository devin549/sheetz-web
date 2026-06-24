import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import { CANCEL_REASONS } from '../board/boardTokens';

export const dynamic = 'force-dynamic';

const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmt = (iso) => { try { return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }); } catch { return ''; } };
const LABEL = Object.fromEntries(CANCEL_REASONS.map((r) => [r.code, r.label]));

export default async function CancelInsights() {
  await requirePerm('seeReports', 'seeFinancials', 'contactCustomer');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Cancel Insights</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('cancellations')
    .select('id, job_id, reason_code, reason_note, cancelled_by, created_at')
    .order('created_at', { ascending: false }).limit(500);
  const cancels = data || [];

  // resolve job amount + customer (no FK → second query)
  const jobIds = [...new Set(cancels.map((c) => c.job_id).filter(Boolean))];
  const jobById = {};
  if (jobIds.length) {
    const { data: jobs } = await sb.from('jobs').select('id, amount, customer_id, job_type').in('id', jobIds);
    (jobs || []).forEach((j) => { jobById[j.id] = j; });
  }

  const byReason = {};
  let lostTotal = 0;
  cancels.forEach((c) => {
    const amt = Number((jobById[c.job_id] || {}).amount) || 0;
    lostTotal += amt;
    const m = (byReason[c.reason_code] = byReason[c.reason_code] || { count: 0, lost: 0 });
    m.count += 1; m.lost += amt;
  });
  const reasons = Object.entries(byReason).map(([code, m]) => ({ code, label: LABEL[code] || code, ...m })).sort((a, b) => b.count - a.count);
  const maxCount = Math.max(1, ...reasons.map((r) => r.count));

  return (
    <div className="wrap" style={{ maxWidth: 900 }}>
      <div className="h1">Cancel Insights</div>
      <p className="muted">Why jobs fall out + the revenue they cost — so we can win the work back. Fed by Cancel-with-reason on the board.</p>

      <div className="card" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', borderTop: '2px solid var(--red)' }}>
        <div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px' }}>Cancellations</div><div style={{ fontSize: 22, fontWeight: 800 }}>{cancels.length}</div></div>
        <div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px' }}>Lost revenue</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--red)' }}>{money(lostTotal)}</div></div>
        <div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px' }}>Top reason</div><div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>{reasons[0]?.label || '—'}</div></div>
      </div>

      {error && <div className="notice">Couldn’t load: {error.message}</div>}
      {!error && !cancels.length && <div className="card"><span className="muted">No cancellations logged — they land here whenever a job is cancelled-with-reason on the board.</span></div>}

      {reasons.length > 0 && (
        <>
          <h3 style={{ fontSize: 12, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.5px', margin: '20px 0 8px' }}>By reason</h3>
          <div className="card" style={{ display: 'grid', gap: 10 }}>
            {reasons.map((r) => (
              <div key={r.code} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ flex: '0 0 200px', fontSize: 13, fontWeight: 600 }}>{r.label}</span>
                <span style={{ flex: 1, height: 8, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: `${Math.round((r.count / maxCount) * 100)}%`, background: 'var(--red)', opacity: 0.7 }} />
                </span>
                <span style={{ flex: '0 0 auto', fontFamily: 'var(--mono)', fontWeight: 700, minWidth: 28, textAlign: 'right' }}>{r.count}</span>
                <span style={{ flex: '0 0 auto', fontFamily: 'var(--mono)', color: 'var(--red)', minWidth: 64, textAlign: 'right' }}>{money(r.lost)}</span>
              </div>
            ))}
          </div>

          <h3 style={{ fontSize: 12, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.5px', margin: '20px 0 8px' }}>Recent</h3>
          <div style={{ display: 'grid', gap: 6 }}>
            {cancels.slice(0, 40).map((c) => {
              const j = jobById[c.job_id] || {};
              return (
                <div key={c.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px' }}>
                  <span className="muted" style={{ fontSize: 11.5, fontFamily: 'var(--mono)', flex: '0 0 auto', minWidth: 48 }}>{fmt(c.created_at)}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{LABEL[c.reason_code] || c.reason_code}</span>
                    {c.reason_note && <span className="muted" style={{ fontSize: 12 }}> — {c.reason_note}</span>}
                    {j.job_type && <span className="muted" style={{ fontSize: 11.5, display: 'block' }}>{j.job_type}</span>}
                  </span>
                  {Number(j.amount) > 0 && <span style={{ fontFamily: 'var(--mono)', color: 'var(--red)', fontWeight: 700 }}>{money(j.amount)}</span>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
