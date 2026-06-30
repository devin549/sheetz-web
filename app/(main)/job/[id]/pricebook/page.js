import { loadCockpit } from '../cockpit';
import JobHeader from '../JobHeader';
import { canSeeCost, buildTiers, marginPct, marginHealth } from '@/lib/pricebookEngine';
import { buildCatalogRoots } from '@/lib/catalogTree';
import { afterHoursForJob } from '@/lib/afterHours';
import PricebookClient from './PricebookClient';
// (Sent-estimate proof panel moved to the Estimate tab — Pricebook stays the build/sell surface.)

export const dynamic = 'force-dynamic';

// Rank items by how well they fit this job (job_type / tags overlap), so the tech doesn't hunt.
function scoreItem(item, jt) {
  const t = String(jt || '').toLowerCase();
  let s = 0;
  (item.job_types || []).forEach((j) => { if (t && (t.includes(String(j).toLowerCase()) || String(j).toLowerCase().includes(t))) s += 3; });
  (item.tags || []).forEach((g) => { if (t.includes(String(g).toLowerCase())) s += 1; });
  return s;
}

// Flat shape the CatalogBrowser reads — customer fields always; cost/margin/min only when allowed (managers).
function shapeFlat(raw, score, showCost) {
  const base = {
    id: raw.id, sku: raw.sku, name: raw.customer_name || raw.name, categoryId: raw.category_id,
    description: raw.customer_description || raw.short_description || '', price: Number(raw.retail_price) || 0,
    warranty: raw.warranty_text || '', photo: raw.primary_photo_url || null, tags: raw.tags || [],
    suggested: score > 0, jobTypes: raw.job_types || [],
  };
  if (showCost) Object.assign(base, { cost: Number(raw.estimated_material_cost) || 0, minimum: raw.minimum_price == null ? null : Number(raw.minimum_price), marginPct: marginPct(raw), marginHealth: marginHealth(raw), laborHours: Number(raw.estimated_labor_hours) || 0 });
  return base;
}

export default async function JobPricebook({ params, searchParams }) {
  const c = await loadCockpit(params.id);
  if (!c.configured) return <div className="wrap"><div className="h1">📖 Pricebook</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;
  const role = c.role;
  const showCost = canSeeCost(role);
  const jt = c.job.job_type || '';

  let needsMigration = false, items = [], cats = [], tiers = [], bundle = null;
  try {
    // The entire sellable book (customer-visible) — the tech drills the full catalog right here.
    const ir = await c.sb.from('pricebook_items').select('*').eq('active', true).eq('customer_visible', true).limit(2000);
    if (ir.error) { if (/relation|does not exist|schema cache/i.test(ir.error.message)) needsMigration = true; }
    else items = ir.data || [];
    if (!needsMigration) {
      const cr = await c.sb.from('pricebook_categories').select('id, name, parent_id, sort_order').order('sort_order');
      cats = cr.data || [];
      // The Good/Better/Best bundle for this job type (first matching).
      const br = await c.sb.from('pricebook_bundles').select('*').eq('active', true);
      const bundles = br.data || [];
      bundle = bundles.find((b) => jt && String(b.job_type || '').toLowerCase() && (jt.toLowerCase().includes(String(b.job_type).toLowerCase()) || String(b.job_type).toLowerCase().includes(jt.toLowerCase()))) || bundles[0] || null;
      if (bundle) {
        const bir = await c.sb.from('pricebook_bundle_items').select('quantity, tiers, sort_order, item:pricebook_items(*)').eq('bundle_id', bundle.id).order('sort_order');
        tiers = buildTiers(bundle, bir.data || []);
      }
    }
  } catch (_) { needsMigration = true; }

  // Rank + shape (flat), then build the drill-down tree the CatalogBrowser renders.
  const shaped = items.map((raw) => shapeFlat(raw, scoreItem(raw, jt), showCost));
  const roots = buildCatalogRoots(cats, shaped);

  // 🧠 Commonly added — learned co-occurrence (real jobs) first, then AI starter picks topped up + tagged.
  const related = {};
  try {
    const { data: usage } = await c.sb.from('job_pricebook_usage').select('job_id, item_id').limit(5000);
    const byJob = {}; (usage || []).forEach((u) => { if (u.job_id && u.item_id) (byJob[u.job_id] = byJob[u.job_id] || []).push(u.item_id); });
    Object.values(byJob).forEach((ids) => ids.forEach((a) => ids.forEach((b) => { if (a !== b) { related[a] = related[a] || {}; related[a][b] = (related[a][b] || 0) + 1; } })));
  } catch (_) {}
  const topRelated = {}; Object.entries(related).forEach(([id, m]) => { topRelated[id] = Object.entries(m).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([rid]) => rid); });
  const aiByItem = {};
  try {
    const { data } = await c.sb.from('pricebook_recommendations').select('item_id, rec_item_id, score').eq('source', 'ai').limit(20000);
    (data || []).forEach((r) => { if (r.item_id && r.rec_item_id) (aiByItem[r.item_id] = aiByItem[r.item_id] || []).push(r); });
    Object.values(aiByItem).forEach((rows) => rows.sort((a, b) => (b.score || 0) - (a.score || 0)));
  } catch (_) {}
  const recommended = {};
  new Set([...Object.keys(topRelated), ...Object.keys(aiByItem)]).forEach((id) => {
    const learned = topRelated[id] || []; const seen = new Set(learned);
    const list = learned.map((rid) => ({ id: rid, ai: false }));
    for (const r of (aiByItem[id] || [])) { if (list.length >= 5) break; if (!seen.has(r.rec_item_id)) { seen.add(r.rec_item_id); list.push({ id: r.rec_item_id, ai: true }); } }
    recommended[id] = list;
  });
  const upgrades = {};
  try {
    const { data: ups } = await c.sb.from('pricebook_item_upgrades').select('item_id, upgrade_id, sort_order').order('sort_order');
    (ups || []).forEach((u) => { if (u.item_id && u.upgrade_id) (upgrades[u.item_id] = upgrades[u.item_id] || []).push(u.upgrade_id); });
  } catch (_) {}

  const job = { id: c.job.id, number: c.job.job_number || '', type: jt, customerId: c.job.customer_id || null, techId: c.job.tech_id || null };

  // 🎫 Deep-link from the standalone catalog: ?add=<itemId> pre-loads that item into the cart. Resolve server-
  // side so the PRICE is authoritative (and it works even for items outside the loaded set). Best-effort.
  let preAdd = null;
  const addId = String(searchParams?.add || '').trim();
  if (addId && !needsMigration) {
    preAdd = shaped.find((it) => String(it.id) === addId) || null;
    if (!preAdd) {
      try {
        const { data: one } = await c.sb.from('pricebook_items').select('*').eq('id', addId).maybeSingle();
        if (one) preAdd = shapeFlat(one, 0, showCost);
      } catch (_) {}
    }
  }

  // ⭐ Member plans for the member-pricing toggle (best-effort; empty before migration 118).
  let plans = [];
  try { const { data } = await c.sb.from('membership_plans').select('slug, name, discount_pct').eq('active', true).order('sort_order'); plans = (data || []).map((p) => ({ slug: p.slug, name: p.name, discount_pct: Number(p.discount_pct) || 0 })); } catch (_) {}

  // 🏷️ Service/urgency tiers (Standard/Priority/Emergency) for the picker + whether THIS job is after-hours
  // (so the tech sees the auto-markup that'll apply). Best-effort; empty/none before migration 150.
  let serviceTiers = [], afterHours = { applies: false, pct: 0, reason: '' };
  try { const { data: st } = await c.sb.from('service_tiers').select('key, label, surcharge_cents, sort').eq('active', true).order('sort'); serviceTiers = (st || []).map((t) => ({ key: t.key, label: t.label, surchargeCents: Number(t.surcharge_cents) || 0 })); } catch (_) {}
  try {
    const { data: ps } = await c.sb.from('pricing_settings').select('*').eq('id', 1).maybeSingle();
    const { data: jrow } = await c.sb.from('jobs').select('scheduled_at, after_hours').eq('id', c.job.id).maybeSingle();
    afterHours = afterHoursForJob(jrow || {}, ps || {});
  } catch (_) {}

  return (
    <div className="wrap" style={{ maxWidth: 980 }}>
      <JobHeader job={c.job} customer={c.customer} tab="Pricebook" />
      {needsMigration ? (
        <div className="notice" style={{ marginTop: 10 }}>Run <code>supabase/104_pricebook.sql</code> + <code>105_pricebook_seed.sql</code> to load the Sheetz Pricebook.</div>
      ) : (
        <>
          <PricebookClient
            job={job}
            customer={{ name: c.customer?.name || 'Customer', address: c.customer?.address || '', phone: c.customer?.phone || '' }}
            roots={roots} related={recommended} upgrades={upgrades} total={shaped.length}
            tiers={tiers}
            bundle={bundle ? { slug: bundle.slug, name: bundle.name, customerDescription: bundle.customer_description, warranty: bundle.warranty_text, approveText: bundle.approval_button_text } : null}
            showMargin={showCost} plans={plans} preAdd={preAdd}
            serviceTiers={serviceTiers} afterHours={afterHours}
          />
        </>
      )}
    </div>
  );
}
