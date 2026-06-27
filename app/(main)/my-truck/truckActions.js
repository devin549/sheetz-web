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
      const { error } = await sb.from('truck_inventory').update({ qty: (Number(hit.qty) || 0) + qty, updated_at: new Date().toISOString() }).eq('id', hit.id);
      if (error) throw error;
      revalidatePath('/my-truck');
      return { ok: true, msg: `+${qty} ${name || sku} on ${targetTech}'s van (now ${(Number(hit.qty) || 0) + qty}).` };
    }
    const { error } = await sb.from('truck_inventory').insert({ tech_name: targetTech, name: name || sku, sku: sku || null, qty, unit, bin, reorder_point: 3 });
    if (error) throw error;
    revalidatePath('/my-truck');
    return { ok: true, msg: `Added ${qty}× ${name || sku} to ${targetTech}'s van.` };
  } catch (e) {
    if (/relation|does not exist|schema cache/i.test(String(e?.message))) return { ok: false, msg: 'Run supabase/05_truck_tools.sql first.' };
    return { ok: false, msg: String(e?.message || e).slice(0, 160) };
  }
}
