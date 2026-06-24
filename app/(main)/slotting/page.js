import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import SlottingClient from './SlottingClient';

export const dynamic = 'force-dynamic';

export default async function Slotting() {
  await requireHref('/slotting');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Slotting &amp; Putaway</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const res = await sb.from('shop_stock').select('id, item, sku, qty, bin, min_qty, note').order('item').limit(1000);
  if (res.error && /could not find|does not exist|schema cache/i.test(res.error.message || '')) {
    return (
      <div className="wrap" style={{ maxWidth: 880 }}>
        <div className="h1">Slotting &amp; Putaway</div>
        <p className="muted">Give every part a home — assign bin locations so anyone can find it.</p>
        <div className="notice">Needs its table — run <code>supabase/49_shop_stock.sql</code> in Supabase.</div>
      </div>
    );
  }
  return (
    <div className="wrap" style={{ maxWidth: 880 }}>
      <div className="h1">Slotting &amp; Putaway</div>
      <p className="muted">Give every part a home — assign bin locations. Unbinned items are flagged for put-away.</p>
      <SlottingClient stock={res.data || []} />
    </div>
  );
}
