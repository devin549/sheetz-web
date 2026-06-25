import Link from 'next/link';
import { loadCockpit } from '../cockpit';
import JobHeader from '../JobHeader';

export const dynamic = 'force-dynamic';

const SUGGEST = [
  [/drain|clog|sewer|rooter/i, ['Drain cleaning', 'Camera inspection', 'Hydro-jetting', 'Cleanout install', 'Membership']],
  [/water ?heater|tankless/i, ['Water heater install', 'Tankless install', 'Expansion tank', 'Flush + service', 'Membership']],
  [/leak|faucet|toilet/i, ['Faucet replace', 'Toilet rebuild', 'Supply lines', 'Shutoff valves', 'Membership']],
  [/excavat|dig|main|replace/i, ['Sewer replacement', 'Spot repair', 'Locate + scope', 'Permit', 'Restoration']],
];
const suggestFor = (t) => (SUGGEST.find(([re]) => re.test(String(t || ''))) || [null, ['Diagnostic', 'Repair', 'Membership', 'Financing']])[1];

export default async function EstimateTab({ params }) {
  const c = await loadCockpit(params.id);
  if (!c.configured) return <div className="wrap"><div className="h1">Estimate</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;
  const sugg = suggestFor(c.job.job_type);

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <JobHeader job={c.job} customer={c.customer} tab="Estimate" />
      <div className="card card-amber" style={{ marginTop: 10 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>🧾 Build estimate · {c.customer.name || 'customer'}</div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Good / better / best options for <strong>{c.job.job_type || 'this job'}</strong>. Present 3 tiers — approval drops fast after ~8 min post-diagnosis.</div>
        <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Suggested for this job type</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>{sugg.map((s) => <span key={s} className="pill">{s}</span>)}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/estimate" className="btn" style={{ textDecoration: 'none' }}>Open Estimate Builder →</Link>
          <Link href="/open-estimates" className="pill" style={{ display: 'inline-flex', alignItems: 'center' }}>Open estimates</Link>
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>⚠ Check margin before presenting: stop quoting parts at cost — 30% markup minimum keeps you in Crown territory.</div>
      </div>
    </div>
  );
}
