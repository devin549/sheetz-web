import { isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import BulkBuyClient from './BulkBuyClient';

export const dynamic = 'force-dynamic';

export default async function BulkBuy() {
  await requireHref('/bulk-buy');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Bulk-Buy Finder</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  return (
    <div className="wrap" style={{ maxWidth: 860 }}>
      <div className="h1">Bulk-Buy Finder</div>
      <p className="muted">Type a part — see live prices across Ferguson, SupplyHouse, Home Depot, Amazon &amp; more, lined up against what you already pay.</p>
      <BulkBuyClient />
    </div>
  );
}
