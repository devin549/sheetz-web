import { requirePerm } from '@/lib/guard';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { canSeeCost, marginPct, marginHealth } from '@/lib/pricebookEngine';
import { canAny } from '@/lib/roles';
import { artFor } from '@/lib/catalogArt';
import CatalogBrowser from './CatalogBrowser';

export const dynamic = 'force-dynamic';

// Placeholder icons by category name until Devin's ST category artwork is wired in.
const ICON = [[/water ?heater|tankless/i, '🔥'], [/drain|sewer|cabl|stoppage|rooter|main ?line/i, '🚿'], [/jett/i, '💦'], [/camera|locat|inspect/i, '📷'], [/toilet/i, '🚽'], [/kitchen/i, '🍴'], [/bath/i, '🛁'], [/faucet|fixture|sink|vanity/i, '🚰'], [/gas|line|pipe|repipe/i, '⛽'], [/pump|lift|sump|ejector/i, '💧'], [/hose ?bib|hydrant/i, '🌳'], [/septic/i, '🦠'], [/laundry/i, '🧺'], [/flood|water damage|mitigation|drying|demolition|restoration|content/i, '🌊'], [/member|club|plan|protection|warranty/i, '🛡️'], [/commercial|apartment|property|hospital/i, '🏢'], [/fee|after ?hours|trip|labor|dispatch/i, '🧾'], [/equipment/i, '🧰'], [/material/i, '📦'], [/template/i, '📋'], [/repair/i, '🔧'], [/residential/i, '🏠'], [/electric/i, '⚡']];
const iconFor = (n) => { for (const [re, e] of ICON) if (re.test(n || '')) return e; return '🔧'; };

export default async function Catalog() {
  const { role, profile } = await requirePerm('changeStatus', 'seeOwnOnly', 'seeCrew', 'seeAllJobs', 'manageInventory', 'seeFinancials');
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">📖 Pricebook</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;
  const sb = getSupabaseAdmin();
  const showCost = canSeeCost(role);

  let cats = [], items = [], needsMig = false;
  try {
    const cr = await sb.from('pricebook_categories').select('id, name, parent_id, sort_order').order('sort_order');
    if (cr.error) { if (/relation|does not exist|schema cache/i.test(cr.error.message)) needsMig = true; } else cats = cr.data || [];
    const ir = await sb.from('pricebook_items').select('id, sku, name, customer_name, customer_description, short_description, retail_price, minimum_price, estimated_material_cost, target_margin_pct, estimated_labor_hours, warranty_text, primary_photo_url, category_id, tags').eq('active', true).limit(2000);
    if (!ir.error) items = ir.data || [];
  } catch { needsMig = true; }
  if (needsMig) return <div className="wrap"><div className="h1">📖 Pricebook</div><div className="notice">Run <code>supabase/104_pricebook.sql</code> + import your book.</div></div>;

  // Shape items for the role; group by category.
  const shaped = items.map((it) => ({
    id: it.id, sku: it.sku, name: it.customer_name || it.name, categoryId: it.category_id,
    description: it.customer_description || it.short_description || '', price: Number(it.retail_price) || 0,
    warranty: it.warranty_text || '', photo: it.primary_photo_url || null, tags: it.tags || [],
    ...(showCost ? { cost: Number(it.estimated_material_cost) || 0, minimum: it.minimum_price == null ? null : Number(it.minimum_price), marginPct: marginPct(it), marginHealth: marginHealth(it), laborHours: Number(it.estimated_labor_hours) || 0 } : {}),
  }));
  const byCat = {}; shaped.forEach((it) => { (byCat[it.categoryId] = byCat[it.categoryId] || []).push(it); });
  const childrenOf = {}; cats.forEach((c) => { const k = c.parent_id || 'root'; (childrenOf[k] = childrenOf[k] || []).push(c); });

  // Build the tree; collapse single-child wrapper categories (no direct items) so the drill-down isn't deep for nothing.
  function build(cat) {
    const kids = (childrenOf[cat.id] || []).map(build).filter((n) => n.count > 0);
    const direct = byCat[cat.id] || [];
    if (kids.length === 1 && direct.length === 0) return kids[0]; // pass-through wrapper → skip
    const node = { id: cat.id, label: cat.name, icon: iconFor(cat.name), art: artFor(cat.name), items: direct, children: kids };
    node.count = direct.length + kids.reduce((s, k) => s + k.count, 0);
    return node;
  }
  const roots = (childrenOf['root'] || []).map(build).filter((n) => n.count > 0).sort((a, b) => b.count - a.count);

  // 🧠 Co-occurrence cross-sell from real jobs.
  const related = {};
  try {
    const { data: usage } = await sb.from('job_pricebook_usage').select('job_id, item_id').limit(5000);
    const byJob = {}; (usage || []).forEach((u) => { if (u.job_id && u.item_id) (byJob[u.job_id] = byJob[u.job_id] || []).push(u.item_id); });
    Object.values(byJob).forEach((ids) => ids.forEach((a) => ids.forEach((b) => { if (a !== b) { related[a] = related[a] || {}; related[a][b] = (related[a][b] || 0) + 1; } })));
  } catch (_) {}
  const topRelated = {}; Object.entries(related).forEach(([id, m]) => { topRelated[id] = Object.entries(m).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([rid]) => rid); });

  // ⬆ Owner-curated upgrades per item (pricebook_item_upgrades, from migration 124). Defensive — empty if unmigrated.
  const upgrades = {};
  try {
    const { data: ups } = await sb.from('pricebook_item_upgrades').select('item_id, upgrade_id, sort_order').order('sort_order');
    (ups || []).forEach((u) => { if (u.item_id && u.upgrade_id) (upgrades[u.item_id] = upgrades[u.item_id] || []).push(u.upgrade_id); });
  } catch (_) {}

  // 🎫 The viewer's OPEN jobs — so they can add a catalog item straight onto a ticket. Non-terminal, recent
  // window, scoped to them (tech_id, else name); office/owner (seeAllJobs) see the recent open board. Best-
  // effort — never breaks the catalog if the jobs table/columns differ.
  let myJobs = [];
  try {
    const TERMINAL = '(done,complete,completed,closed,cancelled,canceled,void)';
    const sinceISO = new Date(Date.now() - 21 * 864e5).toISOString();
    const sel = 'id, job_number, status, scheduled_at, customers(name, address)';
    const seeAll = canAny(role, ['seeAllJobs']);
    let q = sb.from('jobs').select(sel).gte('scheduled_at', sinceISO).not('status', 'in', TERMINAL).order('scheduled_at', { ascending: false }).limit(25);
    if (profile.tech_id) q = q.eq('tech_id', profile.tech_id);
    else if (profile.name && !seeAll) q = q.ilike('tech_name', '%' + profile.name + '%');
    else if (!seeAll) q = null; // no identity + not office → no scoped jobs to show
    const jr = q ? await q : { data: [] };
    myJobs = (jr.data || []).map((j) => ({
      id: j.id, number: j.job_number || '', status: j.status || '', when: j.scheduled_at,
      customer: (j.customers || {}).name || 'Customer', address: (j.customers || {}).address || '',
    }));
  } catch (_) {}

  const canEdit = canAny(role, ['manageInventory', 'manageUsers', 'seeReports', 'seeFinancials', 'assignJobs']);
  return <CatalogBrowser roots={roots} related={topRelated} upgrades={upgrades} showCost={showCost} canEdit={canEdit} total={shaped.length} myJobs={myJobs} />;
}
