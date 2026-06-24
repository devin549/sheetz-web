import { isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireRole } from '@/lib/guard';
import AccountsClient from './AccountsClient';

export const dynamic = 'force-dynamic';

export default async function CustomerAccounts() {
  await requireRole(['owner', 'admin', 'gm', 'om', 'csr', 'dispatcher', 'accounting', 'sales', 'marketing']);

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Customer Accounts</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }

  return (
    <div className="wrap" style={{ maxWidth: 920 }}>
      <div className="h1">Customer Accounts</div>
      <p className="muted">Pull up any customer — account standing, history, and memberships in one place.</p>
      <AccountsClient />
    </div>
  );
}
