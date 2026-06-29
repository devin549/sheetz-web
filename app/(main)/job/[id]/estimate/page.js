import Link from 'next/link';
import { loadCockpitMoney } from '../cockpit';
import JobHeader from '../JobHeader';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import EstimateProofPanel from '../pricebook/EstimateProofPanel';
import EstimatePresent from './EstimatePresent';

export const dynamic = 'force-dynamic';

const SUGGEST = [
  [/drain|clog|sewer|rooter/i, ['Drain cleaning', 'Camera inspection', 'Hydro-jetting', 'Cleanout install', 'Membership']],
  [/water ?heater|tankless/i, ['Water heater install', 'Tankless install', 'Expansion tank', 'Flush + service', 'Membership']],
  [/leak|faucet|toilet/i, ['Faucet replace', 'Toilet rebuild', 'Supply lines', 'Shutoff valves', 'Membership']],
  [/excavat|dig|main|replace/i, ['Sewer replacement', 'Spot repair', 'Locate + scope', 'Permit', 'Restoration']],
];
const suggestFor = (t) => (SUGGEST.find(([re]) => re.test(String(t || ''))) || [null, ['Diagnostic', 'Repair', 'Membership', 'Financing']])[1];

export default async function EstimateTab({ params }) {
  const c = await loadCockpitMoney(params.id);
  if (!c.configured) return <div className="wrap"><div className="h1">Estimate</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;
  const sugg = suggestFor(c.job.job_type);

  // Sent estimates for this job + their proof timeline — the record of what was sent + how the customer
  // responded (moved here from the Pricebook tab; Pricebook builds, Estimate tracks). Best-effort.
  let estimates = [];
  if (isAdminConfigured) {
    try {
      const sb = getSupabaseAdmin();
      const { data: rows } = await sb.from('pricebook_estimates').select('token, headline, subtotal, status, approved_name, approval_method, witnessed_by_name, responded_at, viewed_at, created_at').eq('job_id', c.job.id).order('created_at', { ascending: false }).limit(20);
      const list = rows || [];
      const tokens = list.map((e) => e.token);
      const byTok = {};
      if (tokens.length) { try { const { data: evs } = await sb.from('pricebook_estimate_events').select('token, event_type, method, actor, note, amount, created_at').in('token', tokens).order('created_at', { ascending: true }).limit(300); (evs || []).forEach((ev) => { (byTok[ev.token] = byTok[ev.token] || []).push(ev); }); } catch (_) {} }
      estimates = list.map((e) => ({ ...e, events: byTok[e.token] || [] }));
    } catch (_) {}
  }
  const latest = estimates[0] || null; // the one the tech just built in the Pricebook → present it here

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <JobHeader job={c.job} customer={c.customer} tab="Estimate" />
      {/* Present surface — the estimate built in the Pricebook lands here to send + close. */}
      {latest ? (
        <EstimatePresent jobId={params.id} estimate={latest} />
      ) : (
        <div className="card card-amber" style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>🧾 No estimate yet</div>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Build the job in the Pricebook — pick items / Good·Better·Best — then it lands here to present &amp; send. Approval drops fast after ~8 min post-diagnosis, so build it on site.</div>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Likely for this job type</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>{sugg.map((s) => <span key={s} className="pill">{s}</span>)}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link href={`/job/${params.id}/pricebook`} className="btn" style={{ textDecoration: 'none' }}>🛒 Build it in the Pricebook →</Link>
            <Link href="/open-estimates" className="pill" style={{ display: 'inline-flex', alignItems: 'center' }}>All open estimates</Link>
          </div>
        </div>
      )}

      {/* Sent estimates & approval proof — the record of what was sent + how the customer responded. */}
      <EstimateProofPanel estimates={estimates} />
    </div>
  );
}
