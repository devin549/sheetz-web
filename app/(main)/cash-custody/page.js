import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireRole } from '@/lib/guard';
import CashCustodyClient from './CashCustodyClient';

export const dynamic = 'force-dynamic';

export default async function CashCustody() {
  await requireRole(['owner', 'admin', 'gm', 'om', 'accounting']);

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Cash Custody</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const res = await sb.from('cash_custody')
    .select('id, tech_id, tech_name, job_id, customer, amount_cents, status, collected_at, collected_by, received_by, received_at, deposit_ref, deposited_at, note')
    .order('collected_at', { ascending: false }).limit(200);

  if (res.error && /could not find|does not exist|schema cache/i.test(res.error.message || '')) {
    return <div className="wrap"><div className="h1">Cash Custody</div><div className="notice">Cash custody needs its table — run <code>supabase/33_cash_custody.sql</code> in Supabase.</div></div>;
  }
  const entries = res.data || [];
  const { data: techsData } = await sb.from('techs').select('id, name').order('name');

  return (
    <div className="wrap" style={{ maxWidth: 820 }}>
      <div className="h1">Cash Custody</div>
      <p className="muted">Track cash from collection → turned in → deposited. Cash still <strong>with a tech</strong> is the exposure — keep it small.</p>
      <CashCustodyClient entries={entries} techs={techsData || []} />
    </div>
  );
}
