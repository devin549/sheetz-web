import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireRole } from '@/lib/guard';
import MembershipsClient from './MembershipsClient';

export const dynamic = 'force-dynamic';

export default async function Memberships() {
  await requireRole(['owner', 'admin', 'gm', 'om', 'csr', 'dispatcher', 'accounting', 'sales', 'marketing']);

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Memberships</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const res = await sb.from('memberships')
    .select('*')
    .order('status').order('renews_on', { ascending: true, nullsFirst: false }).limit(500);

  if (res.error && /could not find|does not exist|schema cache/i.test(res.error.message || '')) {
    return (
      <div className="wrap" style={{ maxWidth: 900 }}>
        <div className="h1">Memberships</div>
        <p className="muted">Recurring service plans — the predictable-revenue book.</p>
        <div className="notice">Memberships need their table — run <code>supabase/35_memberships.sql</code> in Supabase, then this fills in.</div>
      </div>
    );
  }

  return (
    <div className="wrap" style={{ maxWidth: 900 }}>
      <div className="h1">Memberships</div>
      <p className="muted">Recurring service plans — the predictable-revenue book. Active plans roll up to monthly + yearly recurring revenue.</p>
      <MembershipsClient rows={res.data || []} />
    </div>
  );
}
