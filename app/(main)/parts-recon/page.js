import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import PartsReconClient from './PartsReconClient';

export const dynamic = 'force-dynamic';

export default async function PartsRecon() {
  await requireHref('/parts-recon');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Parts Reconciliation</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const res = await sb.from('inventory_counts').select('id, item, sku, location, system_qty, counted_qty, variance, counted_by, created_at').order('created_at', { ascending: false }).limit(100);
  if (res.error && /could not find|does not exist|schema cache/i.test(res.error.message || '')) {
    return (
      <div className="wrap" style={{ maxWidth: 860 }}>
        <div className="h1">Parts Reconciliation</div>
        <p className="muted">Count what&apos;s on the shelf vs what the system says — shrink shows up here.</p>
        <div className="notice">Needs its table — run <code>supabase/48_inventory_counts.sql</code> in Supabase.</div>
      </div>
    );
  }
  // item names + a system-qty lookup from truck_inventory (latest qty per name) for prefill
  let items = [];
  const inv = await sb.from('truck_inventory').select('name, qty').limit(2000);
  if (!inv.error) {
    const seen = {}; (inv.data || []).forEach((r) => { const n = (r.name || '').trim(); if (n && !(n in seen)) seen[n] = Number(r.qty) || 0; });
    items = Object.entries(seen).map(([name, qty]) => ({ name, qty }));
  }

  return (
    <div className="wrap" style={{ maxWidth: 860 }}>
      <div className="h1">Parts Reconciliation</div>
      <p className="muted">Count what&apos;s on the shelf vs what the system says. Negative variance = shrink.</p>
      <PartsReconClient counts={res.data || []} items={items} />
    </div>
  );
}
