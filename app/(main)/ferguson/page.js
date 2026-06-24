import { isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import FergusonClient from './FergusonClient';

export const dynamic = 'force-dynamic';

export default async function Ferguson() {
  await requireHref('/ferguson');
  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Ferguson Catalog</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  return (
    <div className="wrap" style={{ maxWidth: 860 }}>
      <div className="h1">Ferguson Catalog</div>
      <p className="muted">Search Ferguson&apos;s listings + prices (via SerpAPI — no Ferguson login needed). Save a price to your book or open the product page.</p>
      <FergusonClient />
    </div>
  );
}
