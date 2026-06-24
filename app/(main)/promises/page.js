import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import PromisesClient from './PromisesClient';

export const dynamic = 'force-dynamic';

export default async function Promises() {
  await requireHref('/promises');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Active Promises</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const res = await sb.from('customer_interactions')
    .select('id, customer_id, customer_name, kind, summary, due_date, owner, created_at')
    .eq('status', 'open').order('due_date', { ascending: true, nullsFirst: false }).limit(200);

  if (res.error && /could not find|does not exist|schema cache/i.test(res.error.message || '')) {
    return (
      <div className="wrap" style={{ maxWidth: 820 }}>
        <div className="h1">Active Promises</div>
        <p className="muted">Every open follow-up + promise across customers, in one place.</p>
        <div className="notice">Needs the CRM table — run <code>supabase/54_customer_interactions.sql</code>.</div>
      </div>
    );
  }

  return (
    <div className="wrap" style={{ maxWidth: 820 }}>
      <div className="h1">Active Promises</div>
      <p className="muted">Every open follow-up + promise across customers — overdue first. Close them as they&apos;re handled.</p>
      <PromisesClient rows={res.data || []} />
    </div>
  );
}
