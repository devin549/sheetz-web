'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { canAny } from '@/lib/roles';
import { postToDiscord } from '@/lib/discord';
import { marginPct, priceForTargetMargin } from '@/lib/pricebookEngine';

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
