import { requirePerm } from '@/lib/guard';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { canMovePrice, canEditPriceFields, canEditPricebookContent } from '@/lib/pricebookEngine';
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

  // GBB bundles for the Bundle Builder (light list; full load happens client-side on open).
  let bundles = [];
  if (!needsMig) {
    try {
      const bq = await sb.from('pricebook_bundles').select('id, slug, name, job_type, active, good_option_name, better_option_name, best_option_name').order('name');
      const rows = bq.data || [];
      const ids = rows.map((b) => b.id);
      const counts = {};
      if (ids.length) { const { data: bi } = await sb.from('pricebook_bundle_items').select('bundle_id').in('bundle_id', ids); (bi || []).forEach((r) => { counts[r.bundle_id] = (counts[r.bundle_id] || 0) + 1; }); }
      bundles = rows.map((b) => ({ id: b.id, slug: b.slug, name: b.name, jobType: b.job_type || '', active: b.active !== false, itemCount: counts[b.id] || 0, tierNames: [b.good_option_name, b.better_option_name, b.best_option_name].filter(Boolean).length }));
    } catch (_) {}
  }

  const newCount = items.filter((i) => i.isNew).length;
  // Price gates: only owner/admin moves a live price (inline editor + Margin-Watch approve). Marketing has
  // no price fields at all; GM/OM edit price via the editor's Pricing tab (which routes to owner approval).
  const priceGate = { canMovePrice: canMovePrice(role), canEditPriceFields: canEditPriceFields(role), canEditContent: canEditPricebookContent(role), role };
  return <PricebookAdmin items={items} cats={cats} needsMig={needsMig} newCount={newCount} priceReqs={priceReqs} priceGate={priceGate} bundles={bundles} />;
}
