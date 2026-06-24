import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import POClient from './POClient';

export const dynamic = 'force-dynamic';

export default async function PurchaseOrders() {
  await requireHref('/purchase-orders');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Purchase Orders</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const poRes = await sb.from('purchase_orders').select('id, po_number, vendor_name, status, total_cents, created_at, created_by').order('created_at', { ascending: false }).limit(100);
  if (poRes.error && /could not find|does not exist|schema cache/i.test(poRes.error.message || '')) {
    return (
      <div className="wrap" style={{ maxWidth: 880 }}>
        <div className="h1">Purchase Orders</div>
        <div className="notice">POs need their tables — run <code>supabase/47_vendors_pos.sql</code> in Supabase.</div>
      </div>
    );
  }
  const { data: vendors } = await sb.from('vendors').select('id, name').order('name');

  return (
    <div className="wrap" style={{ maxWidth: 880 }}>
      <div className="h1">Purchase Orders</div>
      <p className="muted">Raise a PO to a vendor, track it draft → ordered → received.</p>
      <POClient pos={poRes.data || []} vendors={vendors || []} />
    </div>
  );
}
