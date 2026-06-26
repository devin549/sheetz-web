import { requirePerm } from '@/lib/guard';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { canSeeCost, marginPct, marginHealth } from '@/lib/pricebookEngine';
import { classify } from '@/lib/pricebookTaxonomy';
import CatalogBrowser from './CatalogBrowser';

export const dynamic = 'force-dynamic';

export default async function Catalog() {
  const { role } = await requirePerm('changeStatus', 'seeOwnOnly', 'seeCrew', 'seeAllJobs', 'manageInventory', 'seeFinancials');
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">📖 Pricebook</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;
  const sb = getSupabaseAdmin();
  const showCost = canSeeCost(role);

  let items = [], needsMig = false;
  try {
    const ir = await sb.from('pricebook_items').select('id, sku, name, customer_name, customer_description, short_description, retail_price, minimum_price, estimated_material_cost, target_margin_pct, estimated_labor_hours, warranty_text, primary_photo_url, tags, job_types, category_id').eq('active', true).limit(2000);
    if (ir.error) { if (/relation|does not exist|schema cache/i.test(ir.error.message)) needsMig = true; }
    else items = ir.data || [];
  } catch { needsMig = true; }

  if (needsMig) return <div className="wrap"><div className="h1">📖 Pricebook</div><div className="notice">Run <code>supabase/104_pricebook.sql</code> + import your book.</div></div>;

  // Category names (for classification signal).
  let catName = {};
  try { const { data } = await sb.from('pricebook_categories').select('id, name'); (data || []).forEach((c) => { catName[c.id] = c.name; }); } catch (_) {}

  // 🧠 Co-occurrence: what techs sell together (from job_pricebook_usage). Best-effort; empty until data lands.
  const related = {};
  try {
    const { data: usage } = await sb.from('job_pricebook_usage').select('job_id, item_id').limit(5000);
    const byJob = {}; (usage || []).forEach((u) => { if (u.job_id && u.item_id) (byJob[u.job_id] = byJob[u.job_id] || []).push(u.item_id); });
    Object.values(byJob).forEach((ids) => { ids.forEach((a) => ids.forEach((b) => { if (a !== b) { related[a] = related[a] || {}; related[a][b] = (related[a][b] || 0) + 1; } })); });
  } catch (_) {}
  const topRelated = {}; Object.entries(related).forEach(([id, m]) => { topRelated[id] = Object.entries(m).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([rid, n]) => ({ id: rid, n })); });

  // Shape every item for the role (customer fields always; cost/margin only if allowed), keep classify signal.
  const shaped = items.map((it) => ({
    id: it.id, sku: it.sku, name: it.customer_name || it.name, rawName: it.name,
    description: it.customer_description || it.short_description || '', price: Number(it.retail_price) || 0,
    warranty: it.warranty_text || '', photo: it.primary_photo_url || null,
    category_name: catName[it.category_id] || '', job_types: it.job_types || [], tags: it.tags || [],
    ...(showCost ? { cost: Number(it.estimated_material_cost) || 0, minimum: it.minimum_price == null ? null : Number(it.minimum_price), marginPct: marginPct(it), marginHealth: marginHealth(it), laborHours: Number(it.estimated_labor_hours) || 0 } : {}),
  }));

  const tree = classify(shaped, { attachItems: true });

  return <CatalogBrowser tree={tree} related={topRelated} showCost={showCost} total={shaped.length} />;
}
