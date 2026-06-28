import { requirePerm } from '@/lib/guard';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { canMovePrice, canEditPriceFields } from '@/lib/pricebookEngine';
import PricebookAdmin from './PricebookAdmin';

export const dynamic = 'force-dynamic';

// 🛠 Owner pricebook editor — add/customize items + let Flush Gordon hype new drops to the team.
export default async function PricebookAdminPage() {
  const { role } = await requirePerm('manageInventory', 'manageUsers', 'seeReports', 'seeFinancials');
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">🛠 Pricebook Editor</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  const sb = getSupabaseAdmin();

  let items = [], cats = [], needsMig = false;
  try {
    const wk = new Date(Date.now() - 7 * 86400000).toISOString();
    const q = await sb.from('pricebook_items').select('id, name, customer_name, retail_price, estimated_material_cost, created_at, customer_visible').eq('active', true).order('created_at', { ascending: false }).limit(300);
    if (q.error) { if (/relation|does not exist|schema cache/i.test(q.error.message)) needsMig = true; } else items = (q.data || []).map((i) => ({ ...i, isNew: i.created_at && i.created_at >= wk }));
    const cq = await sb.from('pricebook_categories').select('id, name').eq('active', true).order('name');
    cats = cq.data || [];
  } catch { needsMig = true; }

  // Pending AI price-change suggestions awaiting owner sign-off (never auto-applied).
  let priceReqs = [];
  try {
    const pr = await sb.from('pricebook_price_update_requests')
      .select('id, item_id, old_price, recommended_price, old_cost, new_cost, reason, source, created_at')
      .eq('status', 'pending').order('created_at', { ascending: false }).limit(100);
    const reqs = pr.data || [];
    const ids = [...new Set(reqs.map((r) => r.item_id).filter(Boolean))];
    const names = {};
    if (ids.length) { const { data: its } = await sb.from('pricebook_items').select('id, customer_name, name').in('id', ids); (its || []).forEach((i) => { names[i.id] = i.customer_name || i.name; }); }
    priceReqs = reqs.map((r) => ({ ...r, itemName: names[r.item_id] || 'Item' }));
  } catch (_) {}

  const newCount = items.filter((i) => i.isNew).length;
  // Price gates: only owner/admin moves a live price (inline editor + Margin-Watch approve). Marketing has
  // no price fields at all; GM/OM edit price via the editor's Pricing tab (which routes to owner approval).
  const priceGate = { canMovePrice: canMovePrice(role), canEditPriceFields: canEditPriceFields(role), role };
  return <PricebookAdmin items={items} cats={cats} needsMig={needsMig} newCount={newCount} priceReqs={priceReqs} priceGate={priceGate} />;
}
