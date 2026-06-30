'use server';

// 🚜 Equipment asset management (Reid). Add/retire machines, fill the profile + financing, log service.
// Manager-gated (manageInventory / manageUsers). The P&L + scan-out live elsewhere; this is the editor.
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { revalidatePath } from 'next/cache';

const clean = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const cents = (v) => { const s = String(v ?? '').replace(/[^0-9.]/g, '').trim(); return s === '' ? null : Math.round(Number(s) * 100); };
const intOrNull = (v) => { const s = String(v ?? '').replace(/[^0-9]/g, ''); return s === '' ? null : parseInt(s, 10); };
const numOrNull = (v) => { const s = String(v ?? '').replace(/[^0-9.]/g, ''); return s === '' ? null : Number(s); };
const keyOf = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function ctx() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await loadProfile(user) : null;
  if (!user || !profile || profile.active === false) return { ok: false, msg: 'Not signed in.' };
  if (!(can(profile.role, 'manageInventory') || can(profile.role, 'manageUsers'))) return { ok: false, msg: 'Shop / owner only.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  return { ok: true, sb, profile, user, name: profile.name || user.email };
}

const tableHint = (e) => /equipment_fleet|equipment_service|does not exist|column|schema cache/i.test(String(e?.message || e)) ? 'Run supabase/146 + 147 + 148 first.' : String(e?.message || e).slice(0, 140);

function profileFields(fd) {
  return {
    description: clean(fd.get('description'), 300) || null,
    make: clean(fd.get('make'), 80) || null,
    year: intOrNull(fd.get('year')),
    serial: clean(fd.get('serial'), 80) || null,
    engine_hours: numOrNull(fd.get('engine_hours')),
    purchase_cents: cents(fd.get('purchase')),
    purchase_date: clean(fd.get('purchase_date'), 20) || null,
    financed: String(fd.get('financed')) === 'on' || String(fd.get('financed')) === 'true',
    lender: clean(fd.get('lender'), 80) || null,
    monthly_cents: cents(fd.get('monthly')),
    payoff_cents: cents(fd.get('payoff')),
    paid_off: String(fd.get('paid_off')) === 'on' || String(fd.get('paid_off')) === 'true',
  };
}

export async function saveProfile(unitId, fd) {
  const c = await ctx(); if (!c.ok) return c;
  const id = clean(unitId, 80); if (!id) return { ok: false, msg: 'No unit.' };
  const row = profileFields(fd);
  // paid_off ⇒ no balance owed
  if (row.paid_off) { row.payoff_cents = 0; }
  try { const { error } = await c.sb.from('equipment_fleet').update(row).eq('id', id); if (error) return { ok: false, msg: tableHint(error) }; }
  catch (e) { return { ok: false, msg: tableHint(e) }; }
  revalidatePath('/equipment'); revalidatePath('/my-truck');
  return { ok: true, msg: 'Saved.' };
}

export async function addUnit(fd) {
  const c = await ctx(); if (!c.ok) return c;
  const model = clean(fd.get('model'), 80); const unit_label = clean(fd.get('unit_label'), 80);
  if (!model || !unit_label) return { ok: false, msg: 'Model + unit label required (e.g. “17G Excavator”, “17G #5”).' };
  const model_key = clean(fd.get('model_key'), 80) || keyOf(model.split(/\s+/)[0]);
  try {
    const { error } = await c.sb.from('equipment_fleet').insert({ model, model_key, unit_label, kind: 'equipment', ...profileFields(fd) });
    if (error) return { ok: false, msg: /unique|duplicate/i.test(error.message) ? `${unit_label} already exists.` : tableHint(error) };
  } catch (e) { return { ok: false, msg: tableHint(e) }; }
  revalidatePath('/equipment'); revalidatePath('/my-truck');
  return { ok: true, msg: `Added ${unit_label}.` };
}

export async function retireUnit(unitId) {
  const c = await ctx(); if (!c.ok) return c;
  try { const { error } = await c.sb.from('equipment_fleet').update({ active: false }).eq('id', clean(unitId, 80)); if (error) return { ok: false, msg: error.message }; }
  catch (e) { return { ok: false, msg: tableHint(e) }; }
  revalidatePath('/equipment'); revalidatePath('/my-truck');
  return { ok: true, msg: 'Retired.' };
}

export async function addService(unitId, fd) {
  const c = await ctx(); if (!c.ok) return c;
  const id = clean(unitId, 80); const item = clean(fd.get('item'), 120);
  if (!id || !item) return { ok: false, msg: 'What was serviced?' };
  try {
    const { error } = await c.sb.from('equipment_service').insert({
      unit_id: id, item, vendor: clean(fd.get('vendor'), 80) || null, cost_cents: cents(fd.get('cost')),
      service_date: clean(fd.get('service_date'), 20) || undefined, hours: numOrNull(fd.get('hours')),
      note: clean(fd.get('note'), 200) || null, by_name: c.name,
    });
    if (error) return { ok: false, msg: tableHint(error) };
  } catch (e) { return { ok: false, msg: tableHint(e) }; }
  revalidatePath('/equipment');
  return { ok: true, msg: 'Service logged.' };
}

export async function deleteService(serviceId) {
  const c = await ctx(); if (!c.ok) return c;
  try { const { error } = await c.sb.from('equipment_service').delete().eq('id', clean(serviceId, 80)); if (error) return { ok: false, msg: error.message }; }
  catch (e) { return { ok: false, msg: tableHint(e) }; }
  revalidatePath('/equipment');
  return { ok: true, msg: 'Removed.' };
}
