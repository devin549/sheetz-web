import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import { learnBaselines, flagLeaks, fmt } from '@/lib/marginLearn';
import { MARGIN_TARGET } from '@/lib/marginCoach';
import LeakRow from './LeakRow';

export const dynamic = 'force-dynamic';

// Page through jobs (REST caps at 1000/req) so the baseline learns from the whole history.
async function allJobs(sb) {
  const cols = 'id, job_type, status, amount, material_cost_cents, dispatch_fee_cents, tech_name, customer_name';
  const all = [];
  for (let from = 0; from < 12000; from += 1000) {
    let { data, error } = await sb.from('jobs').select(cols).range(from, from + 999);
    if (error) { // fall back to the columns guaranteed to exist
      ({ data, error } = await sb.from('jobs').select('id, job_type, status, amount, material_cost_cents, dispatch_fee_cents, tech_name').range(from, from + 999));
      if (error) return { rows: all, error };
    }
    if (!data || !data.length) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  return { rows: all, error: null };
}

export default async function LeakRadar() {
  await requireHref('/leak-radar');
  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">🩸 Leak Radar</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const { rows: jobs, error } = await allJobs(sb);

  const baselines = learnBaselines(jobs);
  const { flags, totalLeakCents, byReason, count } = flagLeaks(jobs, baselines, { target: MARGIN_TARGET });

  // Merge in any manager dispositions (open flags stay actionable; reviewed ones collapse).
  let reviews = {};
  try {
    const { data } = await sb.from('leak_reviews').select('*');
    (data || []).forEach((r) => { reviews[String(r.job_id)] = r; });
  } catch (_) {}
  const openFlags = flags.filter((f) => !reviews[String(f.id)] || reviews[String(f.id)].status === 'open');
  const doneFlags = flags.filter((f) => reviews[String(f.id)] && reviews[String(f.id)].status !== 'open');
  const openLeak = openFlags.reduce((s, f) => s + f.leakCents, 0);
  const recovered = Object.values(reviews).filter((r) => ['recovered', 'rebilled'].includes(r.status)).reduce((s, r) => s + (Number(r.leak_cents) || 0), 0);

  const learned = [...baselines.values()].filter((b) => b.trusted).sort((a, b) => b.n - a.n);
  const REASON_LABEL = { thin_margin: '📉 Thin margin', underbilled: '🩸 Underbilled', parts_overclaim: '🧾 Parts overclaim', no_receipt: '🐀 No receipt', no_cost: '❓ No cost entered' };

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <div className="h1">🩸 Leak Radar</div>
      <p className="muted">Your own closed jobs are the price book. Each job type learns its typical ticket + margin, then every job that leaks money gets flagged — underbilled, thin margin, padded parts, or revenue booked with no cost. Nothing is charged or edited; you decide what happened.</p>

      {error && <div className="notice">Couldn’t load jobs: {error.message}</div>}

      <div className="card" style={{ display: 'flex', gap: 22, flexWrap: 'wrap', borderTop: '2px solid var(--red)' }}>
        <div style={{ flex: '1 1 130px' }}><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px' }}>Open leak (est.)</div><div style={{ fontSize: 26, fontWeight: 800, color: 'var(--red)' }}>{fmt(openLeak)}</div></div>
        <div style={{ flex: '1 1 110px' }}><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px' }}>Flags open</div><div style={{ fontSize: 26, fontWeight: 800 }}>{openFlags.length}</div></div>
        <div style={{ flex: '1 1 110px' }}><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px' }}>Recovered</div><div style={{ fontSize: 26, fontWeight: 800, color: 'var(--green)' }}>{fmt(recovered)}</div></div>
        <div style={{ flex: '1 1 110px' }}><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px' }}>Types learned</div><div style={{ fontSize: 26, fontWeight: 800 }}>{learned.length}</div></div>
      </div>

      {count > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {Object.entries(byReason).sort((a, b) => b[1] - a[1]).map(([code, n]) => (
            <span key={code} className="pill" style={{ fontSize: 11.5 }}>{REASON_LABEL[code] || code} · {n}</span>
          ))}
        </div>
      )}

      <div className="h2" style={{ marginTop: 18 }}>Open flags{openFlags.length ? ` (${openFlags.length})` : ''}</div>
      {openFlags.length === 0 ? (
        <div className="card muted" style={{ fontSize: 13.5 }}>No open leaks. Either the jobs are clean or costs aren’t entered yet — margin needs <code>material_cost_cents</code> on closed jobs to judge. 👍</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {openFlags.slice(0, 60).map((f) => <LeakRow key={f.id} flag={f} review={reviews[String(f.id)]} />)}
          {openFlags.length > 60 && <div className="muted" style={{ fontSize: 12 }}>+{openFlags.length - 60} more — work the top of the list first (sorted by dollars).</div>}
        </div>
      )}

      {doneFlags.length > 0 && (
        <>
          <div className="h2" style={{ marginTop: 20 }}>Reviewed ({doneFlags.length})</div>
          <div style={{ display: 'grid', gap: 8 }}>{doneFlags.slice(0, 30).map((f) => <LeakRow key={f.id} flag={f} review={reviews[String(f.id)]} />)}</div>
        </>
      )}

      {learned.length > 0 && (
        <>
          <div className="h2" style={{ marginTop: 20 }}>What the company learned</div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: -4 }}>The typical ticket + margin per job type, from your closed history (≥5 jobs to be trusted). This is the bar every new job is measured against.</p>
          <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={{ padding: '8px 10px' }}>Job type</th><th style={{ padding: '8px 10px' }}>Jobs</th><th style={{ padding: '8px 10px' }}>Typical ticket</th><th style={{ padding: '8px 10px' }}>Underbill below</th><th style={{ padding: '8px 10px' }}>Median margin</th>
              </tr></thead>
              <tbody>
                {learned.map((b) => (
                  <tr key={b.type} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>{b.label}</td>
                    <td style={{ padding: '8px 10px' }}>{b.n}</td>
                    <td style={{ padding: '8px 10px' }}>{fmt(b.medianRevenue)}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--amber)' }}>{fmt(b.lowRevenue)}</td>
                    <td style={{ padding: '8px 10px', color: b.medianMargin >= MARGIN_TARGET ? 'var(--green)' : 'var(--red)' }}>{b.medianMargin}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
