'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { canAny } from '@/lib/roles';
import { postToDiscord } from '@/lib/discord';
import { marginPct, priceForTargetMargin, buildTiers } from '@/lib/pricebookEngine';
import { vendorPrices } from '@/lib/serpVendor';
import { searchItems } from '@/lib/pricebookQuery';

// Owner pricebook editor — add/customize items, and let Flush Gordon hype new drops to the team.
const FLUSH = { username: 'Flush Gordon 🚀' };
const num = (v) => Math.max(0, Number(v) || 0);
const clean = (v, n = 300) => String(v == null ? '' : v).trim().slice(0, n);
const canEdit = (r) => canAny(r, ['manageInventory', 'manageUsers', 'seeReports', 'seeFinancials']);

async function ctx() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!canEdit(profile.role)) return { err: 'Owner / office only.' };
  return { user, profile, sb: getSupabaseAdmin() };
}

export async function addPricebookItem(form) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const name = clean(form?.name, 160);
  if (!name) return { ok: false, msg: 'Name is required.' };
  const sku = clean(form?.sku, 40) || ('CB' + Date.now().toString(36).toUpperCase());
  const row = {
    sku, name,
    customer_name: clean(form?.customerName, 160) || name,
    customer_description: clean(form?.customerDescription, 600) || null,
    category_id: form?.categoryId || null,
    retail_price: num(form?.retailPrice),
    estimated_material_cost: num(form?.materialCost),
    customer_visible: form?.customerVisible !== false,
    active: true,
  };
  const { data, error } = await c.sb.from('pricebook_items').insert(row).select('id, name, customer_name, retail_price, created_at').maybeSingle();
  if (error) return { ok: false, msg: /relation|column|schema cache|does not exist/i.test(error.message || '') ? 'Run supabase/104_pricebook.sql first.' : (/duplicate|unique/i.test(error.message || '') ? 'That SKU already exists — leave it blank to auto-generate.' : error.message) };
  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: c.profile.name || c.user.email, role: c.profile.role, action: 'pricebook.add', entity: 'pricebook_item', entity_id: String(data?.id || ''), detail: { name, price: row.retail_price } }); } catch (_) {}
  revalidatePath('/pricebook-admin'); revalidatePath('/catalog');
  return { ok: true, msg: `Added "${name}" — $${row.retail_price}.`, item: data };
}

export async function updateItemPrice(id, retailPrice, materialCost) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  if (!id) return { ok: false, msg: 'No item.' };
  const patch = { retail_price: num(retailPrice) };
  if (materialCost != null && materialCost !== '') patch.estimated_material_cost = num(materialCost);
  const { error } = await c.sb.from('pricebook_items').update(patch).eq('id', id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/pricebook-admin'); revalidatePath('/catalog');
  return { ok: true, msg: 'Price updated.' };
}

// ── AI suggests, owner approves, NEVER auto-changes (Devin's hard rule) ──────────────────────────────
// Margin watch: scan items priced below their target margin and file a PENDING price-change request for
// each. It never touches a price — it just surfaces old price / suggested price / reason for your sign-off.
const DEFAULT_TARGET = 59; // CB house margin when an item has none set.
export async function runMarginWatch() {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  let items = [];
  try {
    const { data, error } = await c.sb.from('pricebook_items')
      .select('id, name, customer_name, retail_price, estimated_material_cost, target_margin_pct')
      .eq('active', true).gt('retail_price', 0).gt('estimated_material_cost', 0).limit(2000);
    if (error) return { ok: false, msg: /relation|column|schema cache|does not exist/i.test(error.message || '') ? 'Run supabase/104_pricebook.sql first.' : error.message };
    items = data || [];
  } catch (e) { return { ok: false, msg: String(e?.message || e) }; }

  // Don't double-file: skip items that already have a pending request.
  const pending = new Set();
  try { const { data } = await c.sb.from('pricebook_price_update_requests').select('item_id').eq('status', 'pending'); (data || []).forEach((r) => pending.add(r.item_id)); } catch (_) {}

  const reqs = [];
  for (const it of items) {
    if (pending.has(it.id)) continue;
    const target = Number(it.target_margin_pct) || DEFAULT_TARGET;
    const m = marginPct(it);
    if (m == null || m >= target - 0.5) continue; // healthy enough — leave it.
    const rec = priceForTargetMargin(it.estimated_material_cost, target);
    if (!rec || rec <= it.retail_price) continue;
    reqs.push({
      item_id: it.id, old_price: it.retail_price, recommended_price: rec,
      old_cost: it.estimated_material_cost, new_cost: it.estimated_material_cost,
      reason: `Margin is ${m}% — below the ${target}% target. Raising to $${rec} restores it.`,
      source: 'margin-watch', status: 'pending', requested_by: c.user.id,
    });
  }
  if (!reqs.length) return { ok: true, msg: 'All priced items are at or near target margin — nothing to flag. 👍' };
  const { error } = await c.sb.from('pricebook_price_update_requests').insert(reqs);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/pricebook-admin');
  return { ok: true, msg: `Flagged ${reqs.length} low-margin item${reqs.length === 1 ? '' : 's'} for your approval below — no prices changed.` };
}

// Owner/GM approves → the recommended price goes live, request marked applied. This is the ONLY path that
// moves a price from a suggestion.
export async function approvePriceChange(id) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  if (!id) return { ok: false, msg: 'No request.' };
  const { data: req } = await c.sb.from('pricebook_price_update_requests').select('id, item_id, recommended_price, old_price, status').eq('id', id).maybeSingle();
  if (!req) return { ok: false, msg: 'Request not found.' };
  if (req.status !== 'pending') return { ok: false, msg: `Already ${req.status}.` };
  const up = await c.sb.from('pricebook_items').update({ retail_price: req.recommended_price }).eq('id', req.item_id);
  if (up.error) return { ok: false, msg: up.error.message };
  await c.sb.from('pricebook_price_update_requests').update({ status: 'applied', approved_by: c.user.id, approved_at: new Date().toISOString() }).eq('id', id);
  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: c.profile.name || c.user.email, role: c.profile.role, action: 'pricebook.price_approve', entity: 'pricebook_item', entity_id: String(req.item_id), detail: { from: req.old_price, to: req.recommended_price } }); } catch (_) {}
  revalidatePath('/pricebook-admin'); revalidatePath('/catalog');
  return { ok: true, msg: `Approved — new price $${req.recommended_price} is live.` };
}

export async function rejectPriceChange(id) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  if (!id) return { ok: false, msg: 'No request.' };
  const { error } = await c.sb.from('pricebook_price_update_requests').update({ status: 'rejected', approved_by: c.user.id, approved_at: new Date().toISOString() }).eq('id', id).eq('status', 'pending');
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/pricebook-admin');
  return { ok: true, msg: 'Rejected — price left unchanged.' };
}

// ── Learning BOM + SerpAPI vendor pricing (#4) ───────────────────────────────────────────────────
// Record (or increment) a "this service uses this part" link. Called by the owner classifying, or by a
// learner that mines what techs actually used on jobs. Increments times_seen on repeat — that's the signal.
export async function recordPartLink(serviceItemId, partName, quantity = 1) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const sid = clean(serviceItemId, 60); const name = clean(partName, 160);
  if (!sid || !name) return { ok: false, msg: 'Service + part name required.' };
  try {
    const { data: existing } = await c.sb.from('pricebook_learned_links').select('id, times_seen').eq('service_item_id', sid).ilike('part_name', name).maybeSingle();
    if (existing) {
      await c.sb.from('pricebook_learned_links').update({ times_seen: (existing.times_seen || 1) + 1, quantity: num(quantity) || 1, updated_at: new Date().toISOString() }).eq('id', existing.id);
      return { ok: true, msg: 'Updated.' };
    }
    const { error } = await c.sb.from('pricebook_learned_links').insert({ service_item_id: sid, part_name: name, quantity: num(quantity) || 1, status: 'suggested' });
    if (error) return { ok: false, msg: /relation|column|schema cache|does not exist/i.test(error.message || '') ? 'Run supabase/119_pricebook_learned_links.sql first.' : error.message };
    revalidatePath('/pricebook-admin');
    return { ok: true, msg: `Linked "${name}" to the service.` };
  } catch (e) { return { ok: false, msg: String(e?.message || e) }; }
}

// Owner classifies a learned link: confirm (counts toward the BOM) or reject (won't suggest again).
export async function setLinkStatus(id, status) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  if (!['confirmed', 'rejected', 'suggested'].includes(status)) return { ok: false, msg: 'Bad status.' };
  const { error } = await c.sb.from('pricebook_learned_links').update({ status, classified_by: c.user.id, classified_at: new Date().toISOString() }).eq('id', id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/pricebook-admin');
  return { ok: true, msg: status === 'confirmed' ? 'Confirmed — it counts toward this service’s parts cost.' : status === 'rejected' ? 'Rejected.' : 'Reset.' };
}

// Pull a live vendor price for the linked part via SerpAPI and cache it on the link.
export async function refreshVendorPrice(id) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const { data: link } = await c.sb.from('pricebook_learned_links').select('id, part_name').eq('id', id).maybeSingle();
  if (!link) return { ok: false, msg: 'Link not found.' };
  const r = await vendorPrices(link.part_name);
  if (!r.ok) return { ok: false, msg: r.msg || 'Lookup failed.' };
  const best = r.sellers[0] || null;
  await c.sb.from('pricebook_learned_links').update({ vendor_seller: best?.seller || null, vendor_price: r.cheapest ?? best?.price ?? null, vendor_url: best?.link || null, vendor_checked_at: new Date().toISOString() }).eq('id', id);
  revalidatePath('/pricebook-admin');
  return { ok: true, msg: best ? `${best.seller || 'Vendor'}: $${r.cheapest ?? best.price}` : 'No price found.', cheapest: r.cheapest, sellers: r.sellers };
}

// 💲 One SerpAPI sweep — price every (non-rejected) part of a service from live vendors, and re-price any
// existing barcodes on those parts by matching the seller. Owner-triggered (costs SerpAPI credits).
export async function priceAllParts(serviceId) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const sid = clean(serviceId, 60); if (!sid) return { ok: false, msg: 'No service.' };
  let links = [];
  try { const { data } = await c.sb.from('pricebook_learned_links').select('id, part_name, part_item_id').eq('service_item_id', sid).neq('status', 'rejected'); links = data || []; } catch (e) { return { ok: false, msg: /relation|schema cache|does not exist/i.test(e?.message || '') ? 'Run supabase/119_pricebook_learned_links.sql first.' : e.message }; }
  let pricedParts = 0, pricedBarcodes = 0;
  for (const l of links) {
    const r = await vendorPrices(l.part_name);
    if (!r.ok || !r.sellers.length) continue;
    const best = r.sellers[0];
    await c.sb.from('pricebook_learned_links').update({ vendor_seller: best.seller || null, vendor_price: r.cheapest ?? best.price, vendor_url: best.link || null, vendor_checked_at: new Date().toISOString() }).eq('id', l.id);
    pricedParts++;
    if (l.part_item_id) {
      const { data: bcs } = await c.sb.from('pricebook_barcodes').select('id, vendor_seller').eq('item_id', l.part_item_id);
      for (const b of (bcs || [])) {
        const vkey = (b.vendor_seller || '').toLowerCase().split(' ')[0];
        const match = vkey && r.sellers.find((s) => (s.seller || '').toLowerCase().includes(vkey));
        if (match) { await c.sb.from('pricebook_barcodes').update({ unit_price: match.price, vendor_url: match.link || null, price_checked_at: new Date().toISOString() }).eq('id', b.id); pricedBarcodes++; }
      }
    }
  }
  revalidatePath('/pricebook-admin');
  return { ok: true, msg: pricedParts ? `Priced ${pricedParts} part${pricedParts === 1 ? '' : 's'}${pricedBarcodes ? ` + ${pricedBarcodes} barcodes` : ''} from live vendors.` : 'No prices found.' };
}

// 🧠 Learner — mine what techs actually used on jobs (shop_issues parts) against the services on those
// jobs (job_pricebook_usage) and record/strengthen the service↔part links. Owner-triggered; preserves
// any 'confirmed'/'rejected' classification (only updates the times_seen learning signal).
export async function learnPartsFromJobs() {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  let usage = [], issues = [];
  try { const { data } = await c.sb.from('job_pricebook_usage').select('job_id, item_id').limit(8000); usage = data || []; } catch (_) {}
  try { const { data } = await c.sb.from('shop_issues').select('job_id, item_name, kind').limit(8000); issues = data || []; } catch (_) {}
  if (!usage.length || !issues.length) return { ok: true, msg: 'Nothing to learn yet — need jobs with both a service sold and parts issued.' };
  const svcByJob = {}; usage.forEach((u) => { if (u.job_id && u.item_id) (svcByJob[u.job_id] = svcByJob[u.job_id] || new Set()).add(u.item_id); });
  const partsByJob = {}; issues.forEach((i) => { if (i.job_id && i.item_name && i.kind !== 'rental') (partsByJob[i.job_id] = partsByJob[i.job_id] || []).push(String(i.item_name).trim()); });
  // Tally co-occurrence: service ↔ part.
  const tally = {};
  for (const [jobId, svcs] of Object.entries(svcByJob)) {
    const parts = partsByJob[jobId]; if (!parts) continue;
    for (const sid of svcs) for (const pn of parts) { if (!pn) continue; const k = sid + '' + pn.toLowerCase(); (tally[k] = tally[k] || { sid, pn, n: 0 }).n++; }
  }
  const entries = Object.values(tally).slice(0, 600); // safety cap per run
  let added = 0, updated = 0;
  for (const e of entries) {
    try {
      const { data: ex } = await c.sb.from('pricebook_learned_links').select('id').eq('service_item_id', e.sid).ilike('part_name', e.pn).maybeSingle();
      if (ex) { await c.sb.from('pricebook_learned_links').update({ times_seen: e.n, updated_at: new Date().toISOString() }).eq('id', ex.id); updated++; }
      else { const { error } = await c.sb.from('pricebook_learned_links').insert({ service_item_id: e.sid, part_name: e.pn, times_seen: e.n, status: 'suggested' }); if (error && /relation|schema cache|does not exist/i.test(error.message || '')) return { ok: false, msg: 'Run supabase/119_pricebook_learned_links.sql first.' }; if (!error) added++; }
    } catch (_) {}
  }
  revalidatePath('/pricebook-admin');
  return { ok: true, msg: `Learned from jobs — ${added} new part link${added === 1 ? '' : 's'}${updated ? `, ${updated} strengthened` : ''}. Review + confirm below.` };
}

// Load a service's parts (learned links) + barcodes + the live-cost rollup vs the baked material cost.
export async function loadServiceParts(serviceId) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err, links: [], barcodes: [] };
  const sid = clean(serviceId, 60); if (!sid) return { ok: false, msg: 'No service.', links: [], barcodes: [] };
  try {
    const { data: svc } = await c.sb.from('pricebook_items').select('id, customer_name, name, retail_price, estimated_material_cost').eq('id', sid).maybeSingle();
    let links = [];
    try { const { data } = await c.sb.from('pricebook_learned_links').select('id, part_name, part_item_id, quantity, times_seen, status, vendor_seller, vendor_price, vendor_url, vendor_checked_at').eq('service_item_id', sid).order('times_seen', { ascending: false }); links = data || []; } catch (e) { if (/relation|schema cache|does not exist/i.test(e?.message || '')) return { ok: false, msg: 'Run supabase/119_pricebook_learned_links.sql first.', links: [], barcodes: [] }; }
    let barcodes = [];
    const itemIds = [sid, ...links.map((l) => l.part_item_id).filter(Boolean)];
    try { const { data } = await c.sb.from('pricebook_barcodes').select('id, item_id, barcode, vendor_seller, label, unit_price, vendor_url').in('item_id', itemIds); barcodes = data || []; } catch (_) {}
    const confirmedCost = links.filter((l) => l.status === 'confirmed' && l.vendor_price > 0).reduce((s, l) => s + Number(l.vendor_price) * (Number(l.quantity) || 1), 0);
    return {
      ok: true,
      service: svc ? { id: svc.id, name: svc.customer_name || svc.name, retail: Number(svc.retail_price) || 0, bakedCost: Number(svc.estimated_material_cost) || 0 } : null,
      links, barcodes, confirmedCost: Math.round(confirmedCost * 100) / 100,
    };
  } catch (e) { return { ok: false, msg: String(e?.message || e), links: [], barcodes: [] }; }
}

// Add a barcode to an item — ONE item, MANY barcodes (Everbilt@HD, Oatey@Lowe's, … all one part).
// Each barcode is a vendor offering with its own price → the item rolls up to avg / by-vendor / cheapest.
export async function addBarcode(itemId, barcode, vendorSeller, label, unitPrice) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const iid = clean(itemId, 60); const code = clean(barcode, 80);
  if (!iid || !code) return { ok: false, msg: 'Item + barcode required.' };
  const price = unitPrice == null || unitPrice === '' ? null : Math.max(0, Number(unitPrice) || 0);
  const { error } = await c.sb.from('pricebook_barcodes').insert({ item_id: iid, barcode: code, vendor_seller: clean(vendorSeller, 80) || null, label: clean(label, 120) || null, unit_price: price, price_checked_at: price ? new Date().toISOString() : null });
  if (error) return { ok: false, msg: /duplicate|unique/i.test(error.message || '') ? 'That barcode is already on file.' : (/relation|schema cache|does not exist/i.test(error.message || '') ? 'Run supabase/120_pricebook_barcodes.sql first.' : error.message) };
  revalidatePath('/pricebook-admin');
  return { ok: true, msg: `Barcode ${code} added.` };
}

export async function removeBarcode(id) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const { error } = await c.sb.from('pricebook_barcodes').delete().eq('id', id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/pricebook-admin');
  return { ok: true, msg: 'Barcode removed.' };
}

// 🚀 Flush Gordon hypes the items added in the last `sinceHours` to the team Discord.
export async function announceDrop(sinceHours = 168) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const since = new Date(Date.now() - num(sinceHours) * 3600000).toISOString();
  let items = [];
  try { const { data } = await c.sb.from('pricebook_items').select('customer_name, name, retail_price, created_at').eq('active', true).gte('created_at', since).order('created_at', { ascending: false }).limit(20); items = data || []; } catch (_) {}
  if (!items.length) return { ok: false, msg: 'Nothing new to announce — add an item first.' };
  const lines = items.slice(0, 12).map((i) => `• **${i.customer_name || i.name}** — starting at $${Math.round(Number(i.retail_price) || 0)}`).join('\n');
  const msg = `🪠🚀 **NEW PRICEBOOK DROP!** ${items.length} fresh ${items.length === 1 ? 'item' : 'items'} just hit the book — go get paid. 💰\n${lines}\n\n_Open the Pricebook on any job to sell 'em._`;
  const r = await postToDiscord(msg, FLUSH);
  if (!r.ok) return { ok: false, msg: "Couldn't reach Discord (" + (r.error || '') + ').' };
  return { ok: true, msg: `Flush Gordon hyped ${items.length} item${items.length === 1 ? '' : 's'} to the team. 🚀` };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// 🪜 GOOD / BETTER / BEST BUNDLE BUILDER — author the customer-facing tier ladder for a job type.
// The OWNER is the only price-mover: this tool NEVER sets or invents a price. A tier's price is the LIVE sum
// of the retail prices of the real catalog items the owner picks into it (buildTiers — same math the close
// uses). All actions share the canEdit() ctx() gate (owner/admin/gm/om/office). No new migration: every
// field already exists in supabase/104_pricebook.sql.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════

const TIER_SET = ['good', 'better', 'best'];
const cleanTiers = (arr) => {
  const out = (Array.isArray(arr) ? arr : []).map((t) => String(t).toLowerCase()).filter((t) => TIER_SET.includes(t));
  return out.length ? [...new Set(out)] : ['good', 'better', 'best'];
};
const slugify = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

// List every bundle (light) for the builder picker — name, job type, slug, whether it has a full GBB ladder.
export async function listBundles() {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err, bundles: [] };
  try {
    const { data, error } = await c.sb.from('pricebook_bundles')
      .select('id, slug, name, job_type, active, good_option_name, better_option_name, best_option_name')
      .order('name');
    if (error) return { ok: false, msg: /relation|column|schema cache|does not exist/i.test(error.message || '') ? 'Run supabase/104_pricebook.sql first.' : error.message, bundles: [] };
    const ids = (data || []).map((b) => b.id);
    const counts = {};
    if (ids.length) { try { const { data: bi } = await c.sb.from('pricebook_bundle_items').select('bundle_id').in('bundle_id', ids); (bi || []).forEach((r) => { counts[r.bundle_id] = (counts[r.bundle_id] || 0) + 1; }); } catch (_) {} }
    const bundles = (data || []).map((b) => ({
      id: b.id, slug: b.slug, name: b.name, jobType: b.job_type || '', active: b.active !== false,
      itemCount: counts[b.id] || 0,
      tierNames: [b.good_option_name, b.better_option_name, b.best_option_name].filter(Boolean).length,
    }));
    return { ok: true, bundles };
  } catch (e) { return { ok: false, msg: String(e?.message || e), bundles: [] }; }
}

// Load one bundle in full + its items (with the catalog item joined) + the LIVE-computed tier ladder.
export async function loadBundle(bundleId) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const id = clean(bundleId, 60); if (!id) return { ok: false, msg: 'No bundle.' };
  try {
    const { data: bundle, error } = await c.sb.from('pricebook_bundles').select('*').eq('id', id).maybeSingle();
    if (error || !bundle) return { ok: false, msg: error?.message || 'Bundle not found.' };
    const { data: rows } = await c.sb.from('pricebook_bundle_items')
      .select('id, quantity, tiers, sort_order, item:pricebook_items(id, sku, name, customer_name, retail_price, estimated_material_cost, primary_photo_url)')
      .eq('bundle_id', id).order('sort_order');
    const items = (rows || []).map((r) => ({
      id: r.id, itemId: r.item?.id, quantity: Number(r.quantity) || 1, tiers: cleanTiers(r.tiers), sortOrder: r.sort_order || 0,
      name: r.item?.customer_name || r.item?.name || '(deleted item)', sku: r.item?.sku || '',
      price: Number(r.item?.retail_price) || 0, cost: Number(r.item?.estimated_material_cost) || 0, photo: r.item?.primary_photo_url || null,
    }));
    return { ok: true, bundle: shapeBundle(bundle), items, tiers: computeTiers(bundle, rows || []) };
  } catch (e) { return { ok: false, msg: String(e?.message || e) }; }
}

// Customer-facing copy projection of a bundle row (what the builder edits).
function shapeBundle(b) {
  return {
    id: b.id, slug: b.slug, name: b.name, jobType: b.job_type || '', active: b.active !== false,
    goodName: b.good_option_name || '', betterName: b.better_option_name || '', bestName: b.best_option_name || '',
    goodBestFor: b.good_best_for || '', betterBestFor: b.better_best_for || '', bestBestFor: b.best_best_for || '',
    customerDescription: b.customer_description || '', warrantyText: b.warranty_text || '',
    customerPhotoUrl: b.customer_photo_url || '', approvalButtonText: b.approval_button_text || 'Approve & Schedule',
  };
}

// LIVE tier ladder for the builder preview — reuses buildTiers (the SAME math the customer close uses), so
// the preview numbers match the real estimate exactly. Returns {key,name,bestFor,price,recommended,includes}.
function computeTiers(bundle, rows) {
  const bundleItems = (rows || []).map((r) => ({ tiers: cleanTiers(r.tiers), quantity: Number(r.quantity) || 1, item: r.item }));
  return buildTiers(bundle, bundleItems);
}

// Create a new (empty) bundle — structure only, no prices. Owner then adds items + copy.
export async function createBundle(form) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const name = clean(form?.name, 160);
  if (!name) return { ok: false, msg: 'Bundle name is required.' };
  const slug = slugify(form?.slug) || slugify(name) || ('bundle-' + Date.now().toString(36));
  const row = {
    slug, name, job_type: clean(form?.jobType, 80) || null, active: true,
    good_option_name: clean(form?.goodName, 120) || null,
    better_option_name: clean(form?.betterName, 120) || null,
    best_option_name: clean(form?.bestName, 120) || null,
    approval_button_text: 'Approve & Schedule',
  };
  const { data, error } = await c.sb.from('pricebook_bundles').insert(row).select('id').maybeSingle();
  if (error) return { ok: false, msg: /duplicate|unique/i.test(error.message || '') ? 'That slug already exists — pick another.' : (/relation|column|schema cache|does not exist/i.test(error.message || '') ? 'Run supabase/104_pricebook.sql first.' : error.message) };
  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: c.profile.name || c.user.email, role: c.profile.role, action: 'pricebook.bundle_create', entity: 'pricebook_bundle', entity_id: String(data?.id || ''), detail: { name, slug } }); } catch (_) {}
  revalidatePath('/pricebook-admin');
  return { ok: true, msg: `Created "${name}".`, bundleId: data?.id };
}

// Save the bundle's customer-facing copy (tier names, best-for lines, description, warranty, photo, CTA).
// NEVER touches a price.
export async function saveBundleCopy(bundleId, form) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const id = clean(bundleId, 60); if (!id) return { ok: false, msg: 'No bundle.' };
  const name = clean(form?.name, 160); if (!name) return { ok: false, msg: 'Bundle name is required.' };
  const patch = {
    name, job_type: clean(form?.jobType, 80) || null,
    good_option_name: clean(form?.goodName, 120) || null,
    better_option_name: clean(form?.betterName, 120) || null,
    best_option_name: clean(form?.bestName, 120) || null,
    good_best_for: clean(form?.goodBestFor, 200) || null,
    better_best_for: clean(form?.betterBestFor, 200) || null,
    best_best_for: clean(form?.bestBestFor, 200) || null,
    customer_description: clean(form?.customerDescription, 800) || null,
    warranty_text: clean(form?.warrantyText, 300) || null,
    customer_photo_url: clean(form?.customerPhotoUrl, 500) || null,
    approval_button_text: clean(form?.approvalButtonText, 60) || 'Approve & Schedule',
    updated_at: new Date().toISOString(),
  };
  const { error } = await c.sb.from('pricebook_bundles').update(patch).eq('id', id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/pricebook-admin'); revalidatePath('/catalog');
  return { ok: true, msg: 'Saved.' };
}

// 🔎 Search the 549-item catalog for items to add — reuses the shared searchItems (the SAME engine the tech
// iPad + /api/pricebook/search use). Owner-gated, so cost/margin come back too.
export async function searchCatalog(q) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err, items: [] };
  const term = clean(q, 80); if (!term) return { ok: true, items: [] };
  try {
    const items = await searchItems(c.sb, term, { showCost: true, limit: 25 });
    return { ok: true, items: items.map((i) => ({ id: i.id, name: i.name, sku: i.sku, price: i.price, cost: i.cost ?? null, marginPct: i.marginPct ?? null, photo: i.photo || null })) };
  } catch (e) { return { ok: false, msg: String(e?.message || e), items: [] }; }
}

// Add a catalog item to the bundle (default: in all three tiers). Returns the refreshed bundle.
export async function addBundleItem(bundleId, itemId, tiers, quantity, sortOrder) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const bid = clean(bundleId, 60), iid = clean(itemId, 60);
  if (!bid || !iid) return { ok: false, msg: 'Bundle + item required.' };
  const row = { bundle_id: bid, item_id: iid, tiers: cleanTiers(tiers), quantity: Math.max(1, Number(quantity) || 1), sort_order: Number(sortOrder) || 0 };
  const { error } = await c.sb.from('pricebook_bundle_items').insert(row);
  if (error) return { ok: false, msg: /duplicate|unique/i.test(error.message || '') ? 'That item is already in this bundle — edit its tiers instead.' : error.message };
  revalidatePath('/pricebook-admin'); revalidatePath('/catalog');
  return loadBundle(bid);
}

// Update one bundle item's tiers / quantity / sort order (which tiers include it = the ladder shape).
export async function updateBundleItem(rowId, patch) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const id = clean(rowId, 60); if (!id) return { ok: false, msg: 'No row.' };
  const { data: existing } = await c.sb.from('pricebook_bundle_items').select('bundle_id, tiers').eq('id', id).maybeSingle();
  if (!existing) return { ok: false, msg: 'Item not found.' };
  const up = {};
  if (patch?.tiers != null) up.tiers = cleanTiers(patch.tiers);
  if (patch?.quantity != null) up.quantity = Math.max(1, Number(patch.quantity) || 1);
  if (patch?.sortOrder != null) up.sort_order = Number(patch.sortOrder) || 0;
  if (!Object.keys(up).length) return { ok: false, msg: 'Nothing to update.' };
  const { error } = await c.sb.from('pricebook_bundle_items').update(up).eq('id', id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/pricebook-admin'); revalidatePath('/catalog');
  return loadBundle(existing.bundle_id);
}

// Remove an item from the bundle.
export async function removeBundleItem(rowId) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const id = clean(rowId, 60); if (!id) return { ok: false, msg: 'No row.' };
  const { data: existing } = await c.sb.from('pricebook_bundle_items').select('bundle_id').eq('id', id).maybeSingle();
  if (!existing) return { ok: false, msg: 'Item not found.' };
  const { error } = await c.sb.from('pricebook_bundle_items').delete().eq('id', id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/pricebook-admin'); revalidatePath('/catalog');
  return loadBundle(existing.bundle_id);
}
