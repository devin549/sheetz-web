import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import OpenEstimatesClient from './OpenEstimatesClient';

export const dynamic = 'force-dynamic';

export default async function OpenEstimates() {
  await requirePerm('seeReports', 'contactCustomer', 'createJobs');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Open Estimates</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('proposals')
    .select('id, job_id, customer, status, selected_key, accepted_total, created_by, created_at, contacted_at, contact_count, outcome, outcome_at')
    .order('created_at', { ascending: false }).limit(200);

  const missing = error && /could not find|does not exist|schema cache/i.test(error.message || '');
  const rows = (data || []).map((p) => ({
    id: p.id, jobId: p.job_id || '', customer: p.customer || 'Customer', tier: p.selected_key || '',
    amount: Number(p.accepted_total) || 0, by: p.created_by || '', createdAt: p.created_at,
    contactCount: p.contact_count || 0, contactedAt: p.contacted_at, outcome: p.outcome || null,
  }));

  return (
    <div className="wrap" style={{ maxWidth: 820 }}>
      <div className="h1">Open Estimates</div>
      <p className="muted">Estimates the customer accepted — follow up fast and win the work. Speed-to-lead is the game.</p>
      {missing
        ? <div className="notice">Open Estimates needs its table — run <code>supabase/30_proposals.sql</code> in Supabase. Then estimates built on <a href="/estimate">Estimate</a> land here.</div>
        : error
          ? <div className="notice">Couldn’t load: {error.message}</div>
          : <OpenEstimatesClient rows={rows} />}
    </div>
  );
}
