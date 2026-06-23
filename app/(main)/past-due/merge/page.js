import Link from 'next/link';
import { requireHref } from '@/lib/guard';
import { can } from '@/lib/roles';
import { isAdminConfigured } from '@/lib/supabaseAdmin';
import MergePanel from './MergePanel';

export const dynamic = 'force-dynamic';

export default async function MergeCustomers() {
  const { role } = await requireHref('/past-due');
  const canMark = can(role, 'seeFinancials') && role !== 'viewer';

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div className="h1" style={{ marginBottom: 2 }}>🔁 Merge customers</div>
        <Link href="/past-due" style={{ fontSize: 13 }}>← Back to A/R</Link>
      </div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Clean up duplicates (e.g. “On Course Home Solutions” vs “Oncourse Home Solutions”). Everything from the duplicate — invoices, notes, contact history, calls — moves onto the one you keep, then the duplicate is removed.</div>

      {!isAdminConfigured && <div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel first.</div>}
      {!canMark && <div className="notice">Your role can’t merge customers.</div>}
      {isAdminConfigured && canMark && <MergePanel />}
    </div>
  );
}
