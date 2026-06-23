import Link from 'next/link';
import { requireHref } from '@/lib/guard';
import { can } from '@/lib/roles';
import { isAdminConfigured } from '@/lib/supabaseAdmin';
import ImportPanel from './ImportPanel';

export const dynamic = 'force-dynamic';

export default async function ImportAr() {
  const { role } = await requireHref('/past-due');
  const canMark = can(role, 'seeFinancials') && role !== 'viewer';

  return (
    <div className="wrap" style={{ maxWidth: 880 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div className="h1" style={{ marginBottom: 2 }}>⬆️ Import A/R</div>
        <Link href="/past-due" style={{ fontSize: 13 }}>← Back to A/R</Link>
      </div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Paste a customer + open-invoice export (e.g. from ServiceTitan) to load real A/R, so reports are current.</div>

      {!isAdminConfigured && <div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel first.</div>}
      {!canMark && <div className="notice">Your role can’t import A/R.</div>}
      {isAdminConfigured && canMark && <ImportPanel />}
    </div>
  );
}
