'use server';

// 🚜 Tagged-equipment scan-out + locate. A tech scans a ShareMyToolbox QR (or types its printed id) to check
// a machine OUT (custody), check it IN, or drop a LOCATE pin. The unit's current snapshot lives on
// equipment_fleet; every scan is logged to equipment_scans. Managers register a tag → unit. Server-only.
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { revalidatePath } from 'next/cache';

const clean = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const digits = (s) => String(s || '').replace(/\D/g, '');

// Any field crew can scan/check-out/locate; registering a tag to a unit is manager-only.
async function ctx(needManage = false) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await loadProfile(user) : null;
  if (!user || !profile || profile.active === false) return { ok: false, msg: 'Not signed in.' };
  const okScan = can(profile.role, 'changeStatus') || can(profile.role, 'seeOwnOnly') || can(profile.role, 'seeCrew') || can(profile.role, 'manageInventory') || can(profile.role, 'manageUsers');
  const okManage = can(profile.role, 'manageInventory') || can(profile.role, 'manageUsers');
  if (needManage ? !okManage : !okScan) return { ok: false, msg: 'Your role can’t do that.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  return { ok: true, sb, profile, user, name: profile.name || user.email, canManage: okManage };
}

const UNIT_COLS = 'id, model, model_key, unit_label, tag_code, status, held_by, held_at, location, lat, lng, scanned_by, scanned_at';

// Resolve a scanned/typed code to a unit. The QR may encode a URL that wraps the printed id, so match
// exact → substring either way → digits-only. Fleet is tiny, so match in JS. Returns {found, unit, code}.
export async function scanTag(rawCode) {
  const c = await ctx(); if (!c.ok) return c;
  const code = clean(rawCode, 200);
  if (!code) return { ok: false, msg: 'Nothing scanned.' };
  let units = [];
  try { const { data, error } = await c.sb.from('equipment_fleet').select(UNIT_COLS).eq('active', true); if (error) throw error; units = data || []; }
  catch (e) { return { ok: false, msg: /equipment_fleet|does not exist|column/i.test(String(e?.message || e)) ? 'Run supabase/146 + 147 first.' : String(e?.message || e).slice(0, 140) }; }
  const cd = digits(code);
  const unit = units.find((u) => {
    const tc = String(u.tag_code || ''); if (!tc) return false;
    return tc === code || code.includes(tc) || tc.includes(code) || (cd && digits(tc) === cd);
  }) || null;
  return { ok: true, found: !!unit, unit, code, canManage: c.canManage, unregistered: !unit ? units.filter((u) => !u.tag_code).map((u) => ({ id: u.id, unit_label: u.unit_label, model: u.model })) : [] };
}

// Manager: bind a physical tag to a unit (or move it). Rejects a tag already on a different unit.
export async function registerTag(unitId, rawCode) {
  const c = await ctx(true); if (!c.ok) return c;
  const id = clean(unitId, 80), code = clean(rawCode, 200);
  if (!id || !code) return { ok: false, msg: 'Pick a unit and scan the tag.' };
  try {
    const { data: clash } = await c.sb.from('equipment_fleet').select('id, unit_label').eq('tag_code', code).maybeSingle();
    if (clash && clash.id !== id) return { ok: false, msg: `That tag is already on ${clash.unit_label}.` };
    const { error } = await c.sb.from('equipment_fleet').update({ tag_code: code }).eq('id', id);
    if (error) return { ok: false, msg: error.message };
    await c.sb.from('equipment_scans').insert({ unit_id: id, tag_code: code, action: 'register', by_name: c.name, by_id: c.user.id });
  } catch (e) { return { ok: false, msg: String(e?.message || e).slice(0, 140) }; }
  revalidatePath('/my-truck');
  return { ok: true, msg: 'Tag registered.' };
}

// Shared writer for checkout / checkin / locate — updates the unit snapshot + logs the scan.
async function applyScan(action, { unitId, location, lat, lng, note }) {
  const c = await ctx(); if (!c.ok) return c;
  const id = clean(unitId, 80); if (!id) return { ok: false, msg: 'No unit.' };
  const now = new Date().toISOString();
  const loc = clean(location, 200) || null;
  const la = Number.isFinite(Number(lat)) ? Number(lat) : null;
  const ln = Number.isFinite(Number(lng)) ? Number(lng) : null;
  const patch = { location: loc, lat: la, lng: ln, scanned_by: c.name, scanned_at: now };
  if (action === 'checkout') { patch.status = 'out'; patch.held_by = c.name; patch.held_at = now; }
  if (action === 'checkin') { patch.status = 'in'; patch.held_by = null; patch.held_at = null; }
  // 'locate' leaves custody as-is, just moves the pin.
  // On checkout, tie the machine to the scanning tech's active job so that job's revenue rolls up to it (P&L).
  let job = null;
  if (action === 'checkout' && c.profile?.tech_id) {
    try { const { data } = await c.sb.from('jobs').select('id, job_number').eq('tech_id', c.profile.tech_id).in('status', ['enroute', 'on_site', 'onsite', 'rolling']).order('scheduled_at', { ascending: true }).limit(1).maybeSingle(); job = data || null; } catch (_) {}
  }
  try {
    const { error } = await c.sb.from('equipment_fleet').update(patch).eq('id', id);
    if (error) return { ok: false, msg: error.message };
    await c.sb.from('equipment_scans').insert({ unit_id: id, action, by_name: c.name, by_id: c.user.id, location: loc, lat: la, lng: ln, note: clean(note, 200) || null });
    // Revenue link — one row per (unit, job); ignore the dup-conflict on repeat scans to the same job.
    if (job?.id) { try { await c.sb.from('equipment_job_use').upsert({ unit_id: id, job_id: job.id, job_number: job.job_number || null, used_by: c.name }, { onConflict: 'unit_id,job_id', ignoreDuplicates: true }); } catch (_) {} }
  } catch (e) { return { ok: false, msg: String(e?.message || e).slice(0, 140) }; }
  revalidatePath('/my-truck');
  const verb = action === 'checkout' ? 'Checked out to you' : action === 'checkin' ? 'Checked in' : 'Location updated';
  return { ok: true, msg: verb + (loc ? ` · ${loc}` : '') + '.' };
}

export const checkoutUnit = (payload) => applyScan('checkout', payload || {});
export const checkinUnit = (payload) => applyScan('checkin', payload || {});
export const locateUnit = (payload) => applyScan('locate', payload || {});
