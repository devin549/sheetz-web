'use server';

// 🚐 Load-out: scan/add a part ONTO a van (the source of truth for van stock, since receipts only capture
// vendor/total — not line items). The shop (Reed/manager) scans parts onto any tech's van at load-out; a
// tech can stock their OWN van. Upserts truck_inventory (increment if the part's already on the van).
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { revalidatePath } from 'next/cache';

const clean = (v, n) => String(v ?? '').trim().slice(0, n);

export async function scanOntoVan(formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await loadProfile(user) : null;
  if (!user || !profile || profile.active === false) return { ok: false, msg: 'Not signed in.' };
  if (!(can(profile.role, 'changeStatus') || can(profile.role, 'seeOwnOnly') || can(profile.role, 'seeCrew') || can(profile.role, 'manageInventory'))) {
    return { ok: false, msg: 'Your role can’t stock a van.' };
  }
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };

  const name = clean(formData.get('name'), 120);
  const sku = clean(formData.get('sku'), 60);
  if (!name && !sku) return { ok: false, msg: 'Scan a barcode or type the part name.' };
  const qty = Math.max(1, Number(formData.get('qty')) || 1);
  const unit = clean(formData.get('unit'), 12) || 'ea';
  const bin = clean(formData.get('bin'), 40) || null;
  // Optional cost-each ($) at load-out — this is what moment-of-use bills onto the job's PO (mig 169).
  const costD = Number(formData.get('cost'));
  const unitCostCents = Number.isFinite(costD) && costD > 0 ? Math.round(costD * 100) : null;
  // Managers/shop can stock any tech's van; a field tech only stocks their own.
  const canTargetOthers = can(profile.role, 'manageInventory') || can(profile.role, 'seeCrew') || can(profile.role, 'manageUsers');
  const targetTech = (canTargetOthers && clean(formData.get('tech_name'), 80)) || profile.name || user.email;
  if (!targetTech) return { ok: false, msg: 'Which van? (no tech name on your profile).' };

  try {
    // Already on the van? (match by SKU if we have one, else by name.)
    let find = sb.from('truck_inventory').select('id, qty').ilike('tech_name', targetTech).limit(1);
    find = sku ? find.eq('sku', sku) : find.ilike('name', name);
    const { data: hit } = await find.maybeSingle();
    if (hit) {
      const patch = { qty: (Number(hit.qty) || 0) + qty, updated_at: new Date().toISOString() };
      if (unitCostCents != null) patch.unit_cost_cents = unitCostCents; // newest cost wins (prices drift)
      let u = await sb.from('truck_inventory').update(patch).eq('id', hit.id);
      if (u.error && /unit_cost|column|schema cache/i.test(u.error.message || '')) { const { unit_cost_cents, ...lite } = patch; u = await sb.from('truck_inventory').update(lite).eq('id', hit.id); } // pre-169
      if (u.error) throw u.error;
      revalidatePath('/my-truck');
      return { ok: true, msg: `+${qty} ${name || sku} on ${targetTech}'s van (now ${(Number(hit.qty) || 0) + qty}).` };
    }
    const row = { tech_name: targetTech, name: name || sku, sku: sku || null, qty, unit, bin, reorder_point: 3, ...(unitCostCents != null ? { unit_cost_cents: unitCostCents } : {}) };
    let ins = await sb.from('truck_inventory').insert(row);
    if (ins.error && /unit_cost|column|schema cache/i.test(ins.error.message || '')) { const { unit_cost_cents, ...lite } = row; ins = await sb.from('truck_inventory').insert(lite); } // pre-169
    const { error } = ins;
    if (error) throw error;
    revalidatePath('/my-truck');
    return { ok: true, msg: `Added ${qty}× ${name || sku} to ${targetTech}'s van.` };
  } catch (e) {
    if (/relation|does not exist|schema cache/i.test(String(e?.message))) return { ok: false, msg: 'Run supabase/05_truck_tools.sql first.' };
    return { ok: false, msg: String(e?.message || e).slice(0, 160) };
  }
}

async function whoami() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await loadProfile(user) : null;
  if (!user || !profile || profile.active === false) return null;
  return { user, profile, name: profile.name || user.email };
}

// 🔍 Truck-Wide Search — find a part across the SHOPS + every tech's van. Powers the inline search sub-tab.
// Returns { ok, shops:[{name,qty,bin,location_id}], vans:[{name,qty,bin,tech_name,mine}] }.
export async function truckWideSearch(query) {
  const me = await whoami();
  if (!me) return { ok: false, msg: 'Not signed in.' };
  const q = clean(query, 80).replace(/[%,]/g, ' ').trim();
  if (q.length < 2) return { ok: true, shops: [], vans: [] };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  const like = `%${q}%`;
  let shops = [], vans = [];
  try {
    const { data } = await sb.from('item_locations').select('name, sku, qty, bin, location_id').eq('location_type', 'shop').gt('qty', 0).or(`name.ilike.${like},sku.ilike.${like}`).order('qty', { ascending: false }).limit(30);
    shops = data || [];
  } catch (_) {}
  try {
    const { data } = await sb.from('truck_inventory').select('name, sku, qty, bin, tech_name').gt('qty', 0).or(`name.ilike.${like},sku.ilike.${like}`).order('qty', { ascending: false }).limit(40);
    const mine = String(me.name || '').trim().toLowerCase();
    vans = (data || []).map((v) => ({ ...v, mine: String(v.tech_name || '').trim().toLowerCase() === mine }));
  } catch (_) {}
  return { ok: true, shops, vans };
}

// Resolve what a van part COSTS so moment-of-use bills real dollars (was hardcoded $0 — audit fix):
// the part's own load-out cost (mig 169) → else the last shop-issue price for the same SKU/name → else 0.
async function vanPartCostCents(sb, p) {
  if (Number(p.unit_cost_cents) > 0) return Number(p.unit_cost_cents);
  try {
    let q = sb.from('shop_issues').select('unit_cost_cents').gt('unit_cost_cents', 0).order('created_at', { ascending: false }).limit(1);
    q = p.sku ? q.eq('sku', p.sku) : q.ilike('item_name', p.name);
    const { data } = await q.maybeSingle();
    if (data && Number(data.unit_cost_cents) > 0) return Number(data.unit_cost_cents);
  } catch (_) {}
  return 0;
}

// Shared moment-of-use: decrement 1 + bill it onto the job's PO with cost + feed most-used. Returns the
// rich result the scan loop shows ("✓ PEX Elbow · $1.89 → job · 6 left ⚠").
async function useOne(sb, me, p, job) {
  if ((Number(p.qty) || 0) <= 0) return { ok: false, msg: `None left on the van — ${p.name} shows 0.` };
  await sb.from('truck_inventory').update({ qty: Number(p.qty) - 1, updated_at: new Date().toISOString() }).eq('id', p.id);
  const costCents = await vanPartCostCents(sb, p);
  try { await sb.from('shop_issues').insert({ job_id: job, item_name: p.name, sku: p.sku || null, qty: 1, unit: 'ea', unit_cost_cents: costCents, total_cost_cents: costCents, kind: 'issue', status: 'out', issued_to: me.name, issued_by: me.name, note: '➖ used from van' }); } catch (_) {}
  const left = Number(p.qty) - 1;
  const low = left <= (p.reorder_point != null ? Number(p.reorder_point) : 3);
  revalidatePath('/my-truck');
  return { ok: true, name: p.name, left, low, costCents, msg: `✓ 1× ${p.name}${costCents ? ` · $${(costCents / 100).toFixed(2)}` : ''} → this ticket · ${left} left${low ? ' ⚠ LOW' : ''}` };
}

// 🏪 VENDOR CHECK — the last rung of the ladder (van → shop → other vans → STORES). On-demand only (a
// deliberate tap, ~1 SerpAPI search) — never fired on every keystroke. Location-pinned to CB's turf
// (serpVendor), so prices are stores a tech can actually drive to. Listed price ≈ availability PROXY —
// the UI says "call to confirm shelf stock" and the hours strip above has the ☎.
export async function vendorCheck(query) {
  const me = await whoami();
  if (!me) return { ok: false, msg: 'Not signed in.', sellers: [] };
  const q = clean(query, 80);
  if (q.length < 2) return { ok: false, msg: 'Type a part first.', sellers: [] };
  const { vendorPrices, serpVendorConfigured } = await import('@/lib/serpVendor');
  if (!serpVendorConfigured()) return { ok: false, msg: 'Store search isn’t configured.', sellers: [] };
  const r = await vendorPrices(q, { limit: 6 });
  if (!r.ok) return { ok: false, msg: r.msg || 'Store check failed.', sellers: [] };
  return { ok: true, sellers: r.sellers, cheapest: r.cheapest };
}

// ➖ Use a part from the van ON a job (moment-of-use): decrement van stock by 1 + log it to the job so it
// bills + feeds the most-used signal. The other half of the scan loop (load-out adds, use subtracts).
export async function useFromVan(partId, jobId) {
  const me = await whoami();
  if (!me) return { ok: false, msg: 'Not signed in.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  const job = clean(jobId, 40);
  if (!job) return { ok: false, msg: 'No active job to use it on.' };
  try {
    let sel = await sb.from('truck_inventory').select('id, name, sku, qty, reorder_point, unit_cost_cents').eq('id', partId).maybeSingle();
    if (sel.error && /unit_cost|column|schema cache/i.test(sel.error.message || '')) sel = await sb.from('truck_inventory').select('id, name, sku, qty, reorder_point').eq('id', partId).maybeSingle(); // pre-169
    const p = sel.data;
    if (!p) return { ok: false, msg: 'Part not found on the van.' };
    return await useOne(sb, me, p, job);
  } catch (e) {
    return { ok: false, msg: String(e?.message || e).slice(0, 160) };
  }
}

// 🔫 SCAN-TO-USE — the tech's picture: grab material off the van, zap the barcode, it lands on the ticket
// with cost and the van count drops. Matches by exact SKU first (the barcode), then name-contains (typed).
// Only THIS tech's van — you can't scan parts off someone else's truck onto your job.
export async function scanUseFromVan(code, jobId) {
  const me = await whoami();
  if (!me) return { ok: false, msg: 'Not signed in.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  const job = clean(jobId, 40);
  const q = clean(code, 80).replace(/[%,]/g, ' ').trim();
  if (!job) return { ok: false, msg: 'No job to bill it to — open the job first.' };
  if (q.length < 2) return { ok: false, msg: 'Scan a barcode or type a part name.' };
  const COLS = 'id, name, sku, qty, reorder_point, unit_cost_cents';
  const COLS_LITE = 'id, name, sku, qty, reorder_point';
  const pick = async (cols) => {
    const bySku = await sb.from('truck_inventory').select(cols).ilike('tech_name', me.name).eq('sku', q).gt('qty', 0).limit(1).maybeSingle();
    if (bySku.error) return bySku;
    if (bySku.data) return bySku;
    return sb.from('truck_inventory').select(cols).ilike('tech_name', me.name).ilike('name', `%${q}%`).gt('qty', 0).order('qty', { ascending: false }).limit(1).maybeSingle();
  };
  try {
    let sel = await pick(COLS);
    if (sel.error && /unit_cost|column|schema cache/i.test(sel.error.message || '')) sel = await pick(COLS_LITE); // pre-169
    const p = sel.data;
    if (!p) return { ok: false, msg: `“${q}” isn’t on your van — check Find a Part (shop/other vans have it?).` };
    return await useOne(sb, me, p, job);
  } catch (e) {
    return { ok: false, msg: String(e?.message || e).slice(0, 160) };
  }
}

// 🔄 Request a van-to-van transfer — drops a message into the team feed tagging the holder (no silent
// auto-move; the holder coordinates). Real + auditable via the existing comms feed.
export async function requestPartTransfer({ part, qty, fromTech }) {
  const me = await whoami();
  if (!me) return { ok: false, msg: 'Not signed in.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  const p = clean(part, 120), holder = clean(fromTech, 80), n = Math.max(1, Number(qty) || 1);
  if (!p || !holder) return { ok: false, msg: 'Missing part or tech.' };
  try {
    await sb.from('cb_comms').insert({
      channel: 'internal', direction: 'internal', from_name: me.name,
      body: `🔄 ${me.name} needs ${n}× ${p} — ${holder} has it on their van. Can you transfer / meet up?`,
      status: 'sent',
    });
  } catch (e) {
    if (/relation|does not exist|schema cache/i.test(String(e?.message))) return { ok: false, msg: 'Chat feed not set up yet.' };
    return { ok: false, msg: 'Could not send the request.' };
  }
  revalidatePath('/messages');
  return { ok: true, msg: `Asked ${holder} for ${n}× ${p} in the team chat.` };
}
