'use server';

// Phase 1 pricebook editor — the full item editor (ServiceTitan field-parity), category-tree management,
// recommended-upgrade pinning, a catalog item search for the pickers, and the live mobile-preview shaper.
//
// HOUSE RULES enforced here:
//  • Owner/admin is the ONLY price-mover. GM/OM may edit price fields, but their change ROUTES to the
//    existing owner-approve gate (pricebook_price_update_requests) — it never writes a live price.
//  • Marketing = merchandising layer ONLY (copy/warranty/legal/photos/category/tags); price fields locked.
//  • Tax = opt-in, default OFF; the editor only edits the `taxable` flag, never computes tax.
//  • Defensive: migration 124 may not be applied — selects/updates degrade gracefully and never crash.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { canEditPricebookContent, canEditPricebookStructure, canMovePrice, canEditPriceFields } from '@/lib/pricebookEngine';

const num = (v) => (v == null || v === '' ? null : Math.max(0, Number(v) || 0));
const clean = (v, n = 400) => String(v == null ? '' : v).trim().slice(0, n);
const cleanArr = (v, n = 24) => (Array.isArray(v) ? v : String(v || '').split(',')).map((x) => clean(x, 60)).filter(Boolean).slice(0, n);
const missingCol = (msg) => /relation|column|schema cache|does not exist/i.test(msg || '');

// Auth context + role. `need` = 'content' (merchandising) or 'structure' (category edits).
async function ctx(need = 'content') {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: 'Sign in required.' };
  const profile = await loadProfile(user);
  const role = profile.role;
  if (need === 'structure' && !canEditPricebookStructure(role)) return { err: 'Owner / GM / OM only.' };
  if (need === 'content' && !canEditPricebookContent(role)) return { err: 'Not allowed.' };
  return { user, profile, role, sb: getSupabaseAdmin() };
}

async function audit(c, action, entityId, detail) {
  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: c.profile.name || c.user.email, role: c.role, action, entity: 'pricebook_item', entity_id: String(entityId || ''), detail: detail || {} }); } catch (_) {}
}

// ── 1a. Item editor ───────────────────────────────────────────────────────────────────────────────────
// All editor fields. We select defensively: if migration 124 columns are missing, we retry with a base set.
const FULL_COLS = 'id, sku, name, customer_name, internal_name, short_description, customer_description, internal_notes, warranty_text, legal_text, retail_price, member_price, add_on_price, member_add_on_price, minimum_price, estimated_material_cost, estimated_labor_hours, target_margin_pct, taxable, allow_discount_codes, allow_membership_discount, is_labor_service, customer_visible, active, requires_manager_approval, category_id, tags, conversion_tags, cross_sale_group, project_label, gl_account, expense_account, business_unit, primary_photo_url, manufacturer, manufacturer_part_number';
const BASE_COLS = 'id, sku, name, customer_name, internal_name, short_description, customer_description, internal_notes, warranty_text, retail_price, minimum_price, estimated_material_cost, estimated_labor_hours, target_margin_pct, taxable, customer_visible, active, requires_manager_approval, category_id, tags, primary_photo_url, manufacturer, manufacturer_part_number';

export async function loadItemEditor(itemId) {
  const c = await ctx('content'); if (c.err) return { ok: false, msg: c.err };
  const id = clean(itemId, 80); if (!id) return { ok: false, msg: 'No item.' };
  let item = null, mig124 = true;
  let q = await c.sb.from('pricebook_items').select(FULL_COLS).eq('id', id).maybeSingle();
  if (q.error && missingCol(q.error.message)) { mig124 = false; q = await c.sb.from('pricebook_items').select(BASE_COLS).eq('id', id).maybeSingle(); }
  if (q.error) return { ok: false, msg: missingCol(q.error.message) ? 'Run supabase/104_pricebook.sql first.' : q.error.message };
  item = q.data;
  if (!item) return { ok: false, msg: 'Item not found.' };

  // Pinned recommended upgrades (manual cross-sell). Degrades to [] if migration 124 not applied.
  let upgrades = [];
  try {
    const { data, error } = await c.sb.from('pricebook_item_upgrades').select('id, upgrade_id, sort_order').eq('item_id', id).order('sort_order');
    if (!error && data?.length) {
      const ids = data.map((u) => u.upgrade_id);
      const { data: its } = await c.sb.from('pricebook_items').select('id, customer_name, name, retail_price').in('id', ids);
      const byId = {}; (its || []).forEach((i) => { byId[i.id] = i; });
      upgrades = data.map((u) => ({ linkId: u.id, id: u.upgrade_id, name: byId[u.upgrade_id]?.customer_name || byId[u.upgrade_id]?.name || 'Item', price: Number(byId[u.upgrade_id]?.retail_price) || 0 })).filter((u) => u.id);
    }
  } catch (_) {}

  return {
    ok: true, item, upgrades, mig124,
    perms: { canPrice: canEditPriceFields(c.role), canMovePrice: canMovePrice(c.role), canStructure: canEditPricebookStructure(c.role), role: c.role },
  };
}

// Non-price merchandising + meta update. PRICE FIELDS ARE NEVER WRITTEN HERE — they go through updateItemPricing.
export async function updateItem(itemId, form) {
  const c = await ctx('content'); if (c.err) return { ok: false, msg: c.err };
  const id = clean(itemId, 80); if (!id) return { ok: false, msg: 'No item.' };
  const f = form || {};
  // Full patch (incl. migration-124 fields). We strip unknown columns on a column-missing error and retry.
  const full = {
    name: clean(f.name, 160) || undefined,
    sku: clean(f.sku, 31) || undefined,
    customer_name: clean(f.customerName, 160) || null,
    internal_name: clean(f.internalName, 160) || null,
    customer_description: clean(f.customerDescription, 2000) || null,
    short_description: clean(f.shortDescription, 600) || null,
    internal_notes: clean(f.internalNotes, 2000) || null,
    warranty_text: clean(f.warrantyText, 2000) || null,
    legal_text: clean(f.legalText, 4000) || null,
    taxable: !!f.taxable,
    allow_discount_codes: f.allowDiscountCodes !== false,
    allow_membership_discount: f.allowMembershipDiscount !== false,
    is_labor_service: !!f.isLaborService,
    customer_visible: f.customerVisible !== false,
    active: f.active !== false,
    category_id: f.categoryId || null,
    tags: cleanArr(f.tags),
    conversion_tags: cleanArr(f.conversionTags),
    cross_sale_group: clean(f.crossSaleGroup, 80) || null,
    project_label: clean(f.projectLabel, 120) || null,
    gl_account: clean(f.glAccount, 80) || null,
    expense_account: clean(f.expenseAccount, 80) || null,
    business_unit: clean(f.businessUnit, 80) || null,
    estimated_labor_hours: num(f.laborHours) ?? 0,
    manufacturer: clean(f.manufacturer, 120) || null,
    manufacturer_part_number: clean(f.manufacturerPart, 120) || null,
  };
  Object.keys(full).forEach((k) => full[k] === undefined && delete full[k]);

  // Columns only present after migration 124 — drop them if the DB rejects an unknown column, then retry.
  const mig124Keys = ['legal_text', 'allow_discount_codes', 'allow_membership_discount', 'is_labor_service', 'conversion_tags', 'cross_sale_group', 'project_label', 'gl_account', 'expense_account', 'business_unit'];
  let patch = { ...full };
  let { error } = await c.sb.from('pricebook_items').update(patch).eq('id', id);
  if (error && missingCol(error.message)) {
    mig124Keys.forEach((k) => delete patch[k]);
    ({ error } = await c.sb.from('pricebook_items').update(patch).eq('id', id));
  }
  if (error) return { ok: false, msg: /duplicate|unique/i.test(error.message || '') ? 'That Code (SKU) is already in use.' : (missingCol(error.message) ? 'Run supabase/104_pricebook.sql first.' : error.message) };
  await audit(c, 'pricebook.item.update', id, { fields: Object.keys(patch).length });
  revalidatePath('/pricebook-admin'); revalidatePath('/catalog');
  return { ok: true, msg: 'Saved.', mig124: !(error && missingCol(error.message)) };
}

// Price fields. Owner/admin writes live. GM/OM → routes the retail price to the owner-approve gate; the
// non-price pricing meta (member/add-on/min/margin/cost/labor cost) it CAN set is saved directly, only the
// live retail price waits for owner sign-off. Marketing never reaches this (canEditPriceFields = false).
export async function updateItemPricing(itemId, form) {
  const c = await ctx('content'); if (c.err) return { ok: false, msg: c.err };
  if (!canEditPriceFields(c.role)) return { ok: false, msg: 'Price fields are locked for your role.' };
  const id = clean(itemId, 80); if (!id) return { ok: false, msg: 'No item.' };
  const f = form || {};
  const retail = num(f.retailPrice);

  // Non-retail pricing fields save directly (they don't move the customer-facing live price).
  const meta = {
    member_price: num(f.memberPrice),
    add_on_price: num(f.addOnPrice),
    member_add_on_price: num(f.memberAddOnPrice),
    minimum_price: num(f.minimumPrice),
    target_margin_pct: num(f.targetMargin),
    estimated_material_cost: num(f.materialCost) ?? 0,
  };
  Object.keys(meta).forEach((k) => meta[k] === undefined && delete meta[k]);
  const metaMig124 = ['member_price', 'add_on_price', 'member_add_on_price'];
  let metaPatch = { ...meta };
  if (Object.keys(metaPatch).length) {
    let r = await c.sb.from('pricebook_items').update(metaPatch).eq('id', id);
    if (r.error && missingCol(r.error.message)) { metaMig124.forEach((k) => delete metaPatch[k]); r = await c.sb.from('pricebook_items').update(metaPatch).eq('id', id); }
    if (r.error) return { ok: false, msg: missingCol(r.error.message) ? 'Run supabase/104_pricebook.sql first.' : r.error.message };
  }

  if (retail == null) { revalidatePath('/pricebook-admin'); return { ok: true, msg: 'Pricing saved.' }; }

  // Read current live price to know if this is actually a change.
  let cur = null;
  try { const { data } = await c.sb.from('pricebook_items').select('retail_price').eq('id', id).maybeSingle(); cur = Number(data?.retail_price) || 0; } catch (_) {}

  if (canMovePrice(c.role)) {
    const { error } = await c.sb.from('pricebook_items').update({ retail_price: retail }).eq('id', id);
    if (error) return { ok: false, msg: error.message };
    await audit(c, 'pricebook.price_set', id, { from: cur, to: retail });
    revalidatePath('/pricebook-admin'); revalidatePath('/catalog');
    return { ok: true, msg: `Price set to $${retail}.` };
  }

  // GM/OM: route to the owner-approve gate instead of writing the live price.
  if (cur != null && retail === cur) { revalidatePath('/pricebook-admin'); return { ok: true, msg: 'Pricing saved (price unchanged).' }; }
  try {
    // Don't stack duplicate pending requests for the same item.
    const { data: dupe } = await c.sb.from('pricebook_price_update_requests').select('id').eq('item_id', id).eq('status', 'pending').maybeSingle();
    if (dupe) { await c.sb.from('pricebook_price_update_requests').update({ recommended_price: retail, reason: `${c.profile.name || 'Office'} requests $${retail} (was $${cur}).`, requested_by: c.user.id }).eq('id', dupe.id); }
    else {
      const { error } = await c.sb.from('pricebook_price_update_requests').insert({ item_id: id, old_price: cur, recommended_price: retail, reason: `${c.profile.name || 'Office'} requests changing the price to $${retail} (was $${cur}).`, source: 'editor', status: 'pending', requested_by: c.user.id });
      if (error) return { ok: false, msg: error.message };
    }
  } catch (e) { return { ok: false, msg: String(e?.message || e) }; }
  await audit(c, 'pricebook.price_request', id, { from: cur, to: retail });
  revalidatePath('/pricebook-admin');
  return { ok: true, msg: `Pricing saved. Your price change to $${retail} is queued for owner approval — the live price hasn’t moved.`, queued: true };
}

// ── Recommended upgrades (manual cross-sell pins) ──────────────────────────────────────────────────────
export async function addItemUpgrade(itemId, upgradeId) {
  const c = await ctx('content'); if (c.err) return { ok: false, msg: c.err };
  const id = clean(itemId, 80), up = clean(upgradeId, 80);
  if (!id || !up) return { ok: false, msg: 'Pick an item.' };
  if (id === up) return { ok: false, msg: 'An item can’t upsell itself.' };
  let nextSort = 0;
  try { const { data } = await c.sb.from('pricebook_item_upgrades').select('sort_order').eq('item_id', id).order('sort_order', { ascending: false }).limit(1); nextSort = ((data && data[0]?.sort_order) || 0) + 1; } catch (_) {}
  const { error } = await c.sb.from('pricebook_item_upgrades').insert({ item_id: id, upgrade_id: up, sort_order: nextSort });
  if (error) return { ok: false, msg: /duplicate|unique/i.test(error.message || '') ? 'Already pinned.' : (missingCol(error.message) ? 'Run supabase/124_pricebook_editor_fields.sql first.' : error.message) };
  revalidatePath('/pricebook-admin');
  return { ok: true, msg: 'Upgrade pinned.' };
}
export async function removeItemUpgrade(linkId) {
  const c = await ctx('content'); if (c.err) return { ok: false, msg: c.err };
  const { error } = await c.sb.from('pricebook_item_upgrades').delete().eq('id', clean(linkId, 80));
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/pricebook-admin');
  return { ok: true, msg: 'Removed.' };
}

// ── Catalog item search (for the upgrade picker + add-on pins). Lightweight, customer-name first. ────────
export async function searchPricebookItems(query, limit = 12) {
  const c = await ctx('content'); if (c.err) return { ok: false, msg: c.err, items: [] };
  const q = clean(query, 80);
  if (!q) return { ok: true, items: [] };
  try {
    const { data, error } = await c.sb.from('pricebook_items')
      .select('id, name, customer_name, sku, retail_price')
      .eq('active', true)
      .or(`customer_name.ilike.%${q}%,name.ilike.%${q}%,sku.ilike.%${q}%`)
      .limit(Math.min(30, Number(limit) || 12));
    if (error) return { ok: false, msg: error.message, items: [] };
    return { ok: true, items: (data || []).map((i) => ({ id: i.id, name: i.customer_name || i.name, sku: i.sku, price: Number(i.retail_price) || 0 })) };
  } catch (e) { return { ok: false, msg: String(e?.message || e), items: [] }; }
}

// ── 1b. Category tree ──────────────────────────────────────────────────────────────────────────────────
// Load the full tree with item + child counts.
export async function loadCategoryTree() {
  const c = await ctx('content'); if (c.err) return { ok: false, msg: c.err, tree: [] };
  let cats = [], counts = {};
  try {
    const { data, error } = await c.sb.from('pricebook_categories').select('id, name, slug, parent_id, sort_order, active, image_url, icon').order('sort_order').order('name');
    if (error && missingCol(error.message)) {
      const { data: d2, error: e2 } = await c.sb.from('pricebook_categories').select('id, name, slug, parent_id, sort_order, active').order('sort_order').order('name');
      if (e2) return { ok: false, msg: 'Run supabase/104_pricebook.sql first.', tree: [] };
      cats = (d2 || []).map((x) => ({ ...x, image_url: null, icon: null }));
    } else if (error) return { ok: false, msg: error.message, tree: [] };
    else cats = data || [];
  } catch (e) { return { ok: false, msg: String(e?.message || e), tree: [] }; }
  // Item counts per category (active items only).
  try { const { data } = await c.sb.from('pricebook_items').select('category_id').eq('active', true).limit(20000); (data || []).forEach((i) => { if (i.category_id) counts[i.category_id] = (counts[i.category_id] || 0) + 1; }); } catch (_) {}

  const byParent = {}; cats.forEach((cat) => { const p = cat.parent_id || '_root'; (byParent[p] = byParent[p] || []).push(cat); });
  const build = (pid) => (byParent[pid] || []).map((cat) => ({ ...cat, itemCount: counts[cat.id] || 0, children: build(cat.id) }));
  return { ok: true, tree: build('_root'), canStructure: canEditPricebookStructure(c.role) };
}

const slugify = (s) => clean(s, 60).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || ('cat-' + Date.now().toString(36));

export async function addCategory(name, parentId) {
  const c = await ctx('structure'); if (c.err) return { ok: false, msg: c.err };
  const nm = clean(name, 120); if (!nm) return { ok: false, msg: 'Name required.' };
  let slug = slugify(nm), tries = 0;
  while (tries < 5) {
    let nextSort = 0;
    try { const { data } = await c.sb.from('pricebook_categories').select('sort_order').eq('parent_id', parentId || null).order('sort_order', { ascending: false }).limit(1); nextSort = ((data && data[0]?.sort_order) || 0) + 1; } catch (_) {}
    const { data, error } = await c.sb.from('pricebook_categories').insert({ name: nm, slug, parent_id: parentId || null, sort_order: nextSort, active: true }).select('id, name, parent_id, sort_order').maybeSingle();
    if (!error) { revalidatePath('/pricebook-admin'); revalidatePath('/catalog'); return { ok: true, msg: 'Category added.', cat: data }; }
    if (/duplicate|unique/i.test(error.message || '')) { slug = slugify(nm) + '-' + (++tries); continue; }
    return { ok: false, msg: missingCol(error.message) ? 'Run supabase/104_pricebook.sql first.' : error.message };
  }
  return { ok: false, msg: 'Could not generate a unique slug.' };
}

export async function renameCategory(catId, name) {
  const c = await ctx('structure'); if (c.err) return { ok: false, msg: c.err };
  const nm = clean(name, 120); if (!nm) return { ok: false, msg: 'Name required.' };
  const { error } = await c.sb.from('pricebook_categories').update({ name: nm, updated_at: new Date().toISOString() }).eq('id', clean(catId, 80));
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/pricebook-admin'); revalidatePath('/catalog');
  return { ok: true, msg: 'Renamed.' };
}

// Move to a new parent (or to root with parentId = null). Blocks moving a node under its own descendant.
export async function moveCategory(catId, newParentId) {
  const c = await ctx('structure'); if (c.err) return { ok: false, msg: c.err };
  const id = clean(catId, 80); const np = newParentId ? clean(newParentId, 80) : null;
  if (!id) return { ok: false, msg: 'No category.' };
  if (id === np) return { ok: false, msg: 'A category can’t be its own parent.' };
  if (np) {
    // Walk up from np; if we hit id, np is a descendant → illegal (would orphan a cycle).
    try {
      const { data: all } = await c.sb.from('pricebook_categories').select('id, parent_id');
      const byId = {}; (all || []).forEach((x) => { byId[x.id] = x.parent_id; });
      let cur = np, guard = 0;
      while (cur && guard++ < 100) { if (cur === id) return { ok: false, msg: 'Can’t move a category inside one of its own subcategories.' }; cur = byId[cur]; }
    } catch (_) {}
  }
  const { error } = await c.sb.from('pricebook_categories').update({ parent_id: np, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/pricebook-admin'); revalidatePath('/catalog');
  return { ok: true, msg: 'Moved.' };
}

// Reorder siblings: explicit ordered id list among one parent.
export async function reorderCategories(orderedIds) {
  const c = await ctx('structure'); if (c.err) return { ok: false, msg: c.err };
  const ids = (Array.isArray(orderedIds) ? orderedIds : []).map((x) => clean(x, 80)).filter(Boolean);
  for (let i = 0; i < ids.length; i++) { try { await c.sb.from('pricebook_categories').update({ sort_order: i }).eq('id', ids[i]); } catch (_) {} }
  revalidatePath('/pricebook-admin'); revalidatePath('/catalog');
  return { ok: true, msg: 'Order saved.' };
}

// Archive (active=false) — the soft-delete. Reversible.
export async function archiveCategory(catId, archived = true) {
  const c = await ctx('structure'); if (c.err) return { ok: false, msg: c.err };
  const { error } = await c.sb.from('pricebook_categories').update({ active: !archived, updated_at: new Date().toISOString() }).eq('id', clean(catId, 80));
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/pricebook-admin'); revalidatePath('/catalog');
  return { ok: true, msg: archived ? 'Archived.' : 'Restored.' };
}

// Safe-delete — REFUSES if the category has children or items (reassign/archive instead).
export async function deleteCategory(catId) {
  const c = await ctx('structure'); if (c.err) return { ok: false, msg: c.err };
  const id = clean(catId, 80); if (!id) return { ok: false, msg: 'No category.' };
  try {
    const { count: childCount } = await c.sb.from('pricebook_categories').select('id', { count: 'exact', head: true }).eq('parent_id', id);
    if ((childCount || 0) > 0) return { ok: false, msg: `Can’t delete — it has ${childCount} subcategor${childCount === 1 ? 'y' : 'ies'}. Move or archive them first.` };
    const { count: itemCount } = await c.sb.from('pricebook_items').select('id', { count: 'exact', head: true }).eq('category_id', id);
    if ((itemCount || 0) > 0) return { ok: false, msg: `Can’t delete — ${itemCount} item${itemCount === 1 ? '' : 's'} live here. Reassign or archive instead.` };
  } catch (e) { return { ok: false, msg: String(e?.message || e) }; }
  const { error } = await c.sb.from('pricebook_categories').delete().eq('id', id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/pricebook-admin'); revalidatePath('/catalog');
  return { ok: true, msg: 'Category deleted.' };
}

// Set a category image url (paste/upload). Degrades with a clear message if column 124 is absent.
export async function setCategoryImage(catId, url) {
  const c = await ctx('structure'); if (c.err) return { ok: false, msg: c.err };
  const u = url == null || url === '' ? null : clean(url, 1000);
  if (u && !/^https?:\/\//.test(u)) return { ok: false, msg: 'Enter a valid https URL.' };
  const { error } = await c.sb.from('pricebook_categories').update({ image_url: u }).eq('id', clean(catId, 80));
  if (error) return { ok: false, msg: missingCol(error.message) ? 'Run supabase/124_pricebook_editor_fields.sql first.' : error.message };
  // TODO(phase1d): wire AI auto-art (scripts/gen_category_art.cjs) + SerpAPI category-art finder here.
  revalidatePath('/pricebook-admin'); revalidatePath('/catalog');
  return { ok: true, msg: 'Image set.' };
}
