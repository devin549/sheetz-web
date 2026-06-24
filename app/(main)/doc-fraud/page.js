import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireRole } from '@/lib/guard';
import DocFraudClient from './DocFraudClient';

export const dynamic = 'force-dynamic';

export default async function DocFraud() {
  const { role } = await requireRole(['owner', 'admin', 'gm', 'om', 'accounting']);

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Doc Fraud Review</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();

  const casesRes = await sb.from('doc_fraud_cases')
    .select('id, tech_id, tech_name, job_id, photo_id, claimed_cents, fee_cents, reason, status, created_by, created_at, resolved_by, payroll_run_id')
    .order('created_at', { ascending: false }).limit(200);
  if (casesRes.error && /could not find|does not exist|schema cache/i.test(casesRes.error.message || '')) {
    return <div className="wrap"><div className="h1">Doc Fraud Review</div><div className="notice">Doc-fraud needs its table — run <code>supabase/32_doc_fraud.sql</code> in Supabase.</div></div>;
  }
  const cases = casesRes.data || [];

  const { data: techsData } = await sb.from('techs').select('id, name').order('name');
  const techs = techsData || [];

  // Candidates: flagged receipts not already turned into a case (guarded — receipt_entries optional).
  let candidates = [];
  const fr = await sb.from('receipt_entries').select('photo_id, job_id, vendor, amount_cents').eq('status', 'flagged');
  if (!fr.error) {
    const have = new Set(cases.map((c) => c.photo_id).filter(Boolean));
    const flagged = (fr.data || []).filter((f) => !have.has(f.photo_id));
    const jids = [...new Set(flagged.map((f) => f.job_id).filter(Boolean))];
    const tj = {};
    if (jids.length) { const { data: js } = await sb.from('jobs').select('id, tech_id, tech_name').in('id', jids); (js || []).forEach((j) => { tj[j.id] = { techId: j.tech_id, techName: j.tech_name }; }); }
    candidates = flagged.map((f) => ({ photoId: f.photo_id, jobId: f.job_id || '', vendor: f.vendor || '', amountCents: f.amount_cents || 0, techId: (tj[f.job_id] || {}).techId || '', techName: (tj[f.job_id] || {}).techName || '' }));
  }

  return (
    <div className="wrap" style={{ maxWidth: 860 }}>
      <div className="h1">Doc Fraud Review</div>
      <p className="muted">Claimed materials with no produced receipt → strip the claim + a fee. The fee posts as a reviewed deduction on draft payroll — never a silent cut.</p>
      <DocFraudClient cases={cases} candidates={candidates} techs={techs} canApprove={['owner', 'admin', 'gm', 'om'].includes(String(role).toLowerCase())} />
    </div>
  );
}
