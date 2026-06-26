// lib/pricebookQuery.js — shared server query + shaping for the Pricebook API and screens.
// Server-only (takes an admin Supabase client). One source of truth so /api/pricebook/* and the
// catalog page never drift. Cost / margin / minimum / vendor data is gated behind showCost.
// (Pricing/tier MATH lives in lib/pricebook.js — this file is the data layer.)
import { marginPct, marginHealth, priceForTargetMargin } from '@/lib/pricebookEngine';

const ITEM_COLS =
  'id, sku, name, customer_name, customer_description, short_description, retail_price, minimum_price, ' +
  'estimated_material_cost, target_margin_pct, estimated_labor_hours, warranty_text, primary_photo_url, ' +
  'pdf_url, video_url, category_id, tags, customer_visible';

// Customer-safe by default. showCost=true (owner/office/tech-with-cost) adds cost/margin/minimum/labor.
export function shapeItem(it, showCost) {
  const out = {
    id: it.id, sku: it.sku, name: it.customer_name || it.name,
    description: it.customer_description || it.short_description || '',
    price: Number(it.retail_price) || 0, warranty: it.warranty_text || '',
    photo: it.primary_photo_url || null, pdf: it.pdf_url || null, video: it.video_url || null,
    categoryId: it.category_id, tags: it.tags || [],
  };
  if (showCost) {
    out.internalName = it.name;
    out.cost = Number(it.estimated_material_cost) || 0;
    out.minimum = it.minimum_price == null ? null : Number(it.minimum_price);
    out.marginPct = marginPct(it);
    out.marginHealth = marginHealth(it);
    out.targetMargin = Number(it.target_margin_pct) || null;
    out.laborHours = Number(it.estimated_labor_hours) || 0;
  }
  return out;
}

// 🔎 Search items by name / sku / tags / aliases. Ranks whole-phrase + alias hits highest.
export async function searchItems(sb, q, { showCost = false, limit = 25 } = {}) {
  const term = String(q || '').trim().toLowerCase();
  if (!term) return [];
  const words = term.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 1);
  const aliasIds = new Set();
  try {
    const { data } = await sb.from('pricebook_item_aliases').select('item_id').eq('active', true).ilike('phrase', `%${term}%`).limit(300);
    (data || []).forEach((a) => aliasIds.add(a.item_id));
  } catch (_) {}
  const { data: rows } = await sb.from('pricebook_items').select(ITEM_COLS).eq('active', true).limit(2000);
  const pool = (rows || []).filter((it) => showCost || it.customer_visible !== false);
  return pool
    .map((it) => {
      const hay = `${it.customer_name || ''} ${it.name} ${(it.tags || []).join(' ')}`.toLowerCase();
      let score = words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0);
      if (hay.includes(term)) score += 3;
      if (aliasIds.has(it.id)) score += 2;
      return { it, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (Number(a.it.retail_price) || 0) - (Number(b.it.retail_price) || 0))
    .slice(0, limit)
    .map((x) => shapeItem(x.it, showCost));
}

// Photos / PDFs / manufacturer links for an item. Customer-visible media only unless showCost.
export async function mediaFor(sb, id, { showCost = false } = {}) {
  if (!id) return [];
  try {
    let qb = sb.from('pricebook_media').select('media_type, title, url, customer_visible, sort_order').eq('item_id', id);
    if (!showCost) qb = qb.eq('customer_visible', true);
    const { data } = await qb.order('sort_order').limit(40);
    return (data || []).map((m) => ({ type: m.media_type, title: m.title || '', url: m.url }));
  } catch (_) { return []; }
}

// Full item detail: item + media + aliases + (cost-gated) vendor prices.
export async function itemDetail(sb, id, { showCost = false } = {}) {
  if (!id) return null;
  const { data: it } = await sb.from('pricebook_items').select(ITEM_COLS).eq('id', id).maybeSingle();
  if (!it) return null;
  if (!showCost && it.customer_visible === false) return null;
  const out = shapeItem(it, showCost);
  out.media = await mediaFor(sb, id, { showCost });
  try { const { data: al } = await sb.from('pricebook_item_aliases').select('phrase').eq('item_id', id).eq('active', true).limit(50); out.aliases = (al || []).map((a) => a.phrase); } catch (_) { out.aliases = []; }
  if (showCost) {
    try { const { data: vp } = await sb.from('pricebook_vendor_prices').select('vendor_name, vendor_sku, vendor_url, last_cost, new_cost, approved_cost, status, last_checked_at').eq('item_id', id).limit(20); out.vendors = vp || []; } catch (_) { out.vendors = []; }
  }
  return out;
}

// 🧠 Co-occurrence cross-sell: items that show up on the same jobs as the given item(s).
export async function relatedItems(sb, itemIds, { showCost = false, limit = 4 } = {}) {
  const seeds = (Array.isArray(itemIds) ? itemIds : [itemIds]).filter(Boolean);
  if (!seeds.length) return [];
  try {
    const { data: usage } = await sb.from('job_pricebook_usage').select('job_id, item_id').limit(8000);
    const byJob = {}; (usage || []).forEach((u) => { if (u.job_id && u.item_id) (byJob[u.job_id] = byJob[u.job_id] || []).push(u.item_id); });
    const seedSet = new Set(seeds), tally = {};
    Object.values(byJob).forEach((ids) => {
      if (!ids.some((id) => seedSet.has(id))) return;
      ids.forEach((id) => { if (!seedSet.has(id)) tally[id] = (tally[id] || 0) + 1; });
    });
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
    if (!top.length) return [];
    const { data: rows } = await sb.from('pricebook_items').select(ITEM_COLS).in('id', top).eq('active', true);
    const order = new Map(top.map((id, i) => [id, i]));
    return (rows || [])
      .filter((it) => showCost || it.customer_visible !== false)
      .sort((a, b) => order.get(a.id) - order.get(b.id))
      .map((it) => ({ ...shapeItem(it, showCost), coOccur: tally[it.id] }));
  } catch (_) { return []; }
}

const BUNDLE_COLS = 'id, slug, name, job_type, description, good_option_name, better_option_name, best_option_name, customer_photo_url, customer_pdf_url';

// Bundle (Good / Better / Best) for a job type. Returns tiers with line items + totals.
export async function bundleForJobType(sb, jobType, { showCost = false } = {}) {
  if (!jobType) return null;
  try {
    const { data: b } = await sb.from('pricebook_bundles').select(BUNDLE_COLS).eq('active', true).ilike('job_type', `%${jobType}%`).limit(1).maybeSingle();
    if (!b) return null;
    return await bundleDetail(sb, b, { showCost });
  } catch (_) { return null; }
}

export async function bundleBySlug(sb, slug, { showCost = false } = {}) {
  if (!slug) return null;
  try {
    const { data: b } = await sb.from('pricebook_bundles').select(BUNDLE_COLS).eq('slug', slug).eq('active', true).maybeSingle();
    if (!b) return null;
    return await bundleDetail(sb, b, { showCost });
  } catch (_) { return null; }
}

// Shared bundle shaper: required = always in (Good); optional steps up to Better; upsell steps up to Best.
async function bundleDetail(sb, b, { showCost }) {
  const { data: bi } = await sb.from('pricebook_bundle_items').select('item_id, quantity, required_or_optional, sort_order').eq('bundle_id', b.id).order('sort_order');
  const ids = [...new Set((bi || []).map((x) => x.item_id))];
  const itemsById = {};
  if (ids.length) { const { data: rows } = await sb.from('pricebook_items').select(ITEM_COLS).in('id', ids); (rows || []).forEach((it) => { itemsById[it.id] = it; }); }
  const lines = (bi || []).map((x) => { const it = itemsById[x.item_id]; return it ? { ...shapeItem(it, showCost), quantity: Number(x.quantity) || 1, kind: x.required_or_optional } : null; }).filter(Boolean);
  const sum = (arr) => Math.round(arr.reduce((s, l) => s + l.price * l.quantity, 0) * 100) / 100;
  const required = lines.filter((l) => l.kind === 'required');
  const optional = lines.filter((l) => l.kind === 'optional');
  const upsell = lines.filter((l) => l.kind === 'upsell');
  const tiers = [
    { key: 'good', label: b.good_option_name || 'Good', lines: required, total: sum(required) },
    { key: 'better', label: b.better_option_name || 'Better', lines: required.concat(optional), total: sum(required.concat(optional)) },
    { key: 'best', label: b.best_option_name || 'Best', lines: required.concat(optional, upsell), total: sum(required.concat(optional, upsell)) },
  ];
  return { id: b.id, slug: b.slug, name: b.name, jobType: b.job_type || '', description: b.description || '', photo: b.customer_photo_url || null, pdf: b.customer_pdf_url || null, tiers };
}

// Build an estimate from a list of {itemId, quantity}. Totals + (cost-gated) margin + below-minimum flags.
export async function buildEstimate(sb, picks, { showCost = false } = {}) {
  const list = (Array.isArray(picks) ? picks : []).map((p) => (typeof p === 'string' ? { itemId: p, quantity: 1 } : p)).filter((p) => p && p.itemId);
  if (!list.length) return { lines: [], subtotal: 0 };
  const ids = [...new Set(list.map((p) => p.itemId))];
  const { data: rows } = await sb.from('pricebook_items').select(ITEM_COLS).in('id', ids);
  const byId = {}; (rows || []).forEach((it) => { byId[it.id] = it; });
  const lines = list.map((p) => {
    const it = byId[p.itemId]; if (!it) return null;
    const qty = Math.max(0, Number(p.quantity) || 1);
    const shaped = shapeItem(it, showCost);
    const lineTotal = Math.round(shaped.price * qty * 100) / 100;
    const o = { ...shaped, quantity: qty, lineTotal };
    if (showCost) o.lineCost = Math.round((shaped.cost || 0) * qty * 100) / 100;
    return o;
  }).filter(Boolean);
  const subtotal = Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
  const out = { lines, subtotal };
  if (showCost) {
    const cost = Math.round(lines.reduce((s, l) => s + (l.lineCost || 0), 0) * 100) / 100;
    out.cost = cost;
    out.marginPct = subtotal > 0 ? Math.round(((subtotal - cost) / subtotal) * 1000) / 10 : null;
    out.belowMinimum = lines.filter((l) => l.minimum != null && l.price < l.minimum).map((l) => ({ id: l.id, name: l.name, price: l.price, minimum: l.minimum }));
  }
  return out;
}

export { priceForTargetMargin };
