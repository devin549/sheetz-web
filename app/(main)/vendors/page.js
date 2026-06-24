import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import VendorsClient from './VendorsClient';

export const dynamic = 'force-dynamic';

export default async function Vendors() {
  await requireHref('/vendors');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Vendors</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const vRes = await sb.from('vendors').select('id, name, account_no, rep, phone, email, terms, note').order('name');
  if (vRes.error && /could not find|does not exist|schema cache/i.test(vRes.error.message || '')) {
    return (
      <div className="wrap" style={{ maxWidth: 900 }}>
        <div className="h1">Vendors</div>
        <p className="muted">Your suppliers + the price book the Bulk-Buy Finder compares against.</p>
        <div className="notice">Vendors need their tables — run <code>supabase/47_vendors_pos.sql</code> in Supabase.</div>
      </div>
    );
  }
  const { data: prices } = await sb.from('vendor_prices').select('id, vendor_id, vendor_name, item, sku, price_cents, unit, updated_at').order('updated_at', { ascending: false }).limit(500);

  return (
    <div className="wrap" style={{ maxWidth: 900 }}>
      <div className="h1">Vendors</div>
      <p className="muted">Your suppliers + the price book. Save what you pay per part; the Bulk-Buy Finder will price-shop it against the market.</p>
      <VendorsClient vendors={vRes.data || []} prices={prices || []} />
    </div>
  );
}
