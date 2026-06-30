'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { canUploadPhotos } from '../jobAccess';

const clean = (v, n = 120) => String(v == null ? '' : v).trim().slice(0, n);
const intOrNull = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const APPLIANCE_LABEL = { water_heater: 'Water heater', tankless: 'Tankless water heater', garbage_disposal: 'Garbage disposal', water_softener: 'Water softener', sump_pump: 'Sump pump', furnace: 'Furnace', boiler: 'Boiler', other: 'Equipment' };
const missing = (e) => /relation|column|schema cache|does not exist/i.test(e?.message || '');

// 🔎 Quick search saved equipment by BRAND (or model/serial) — "type Rheem, see every unit on file." Fast
// recall for parts/warranty. Returns each unit + which customer it's at. Guarded; fail-soft pre-103.
export async function searchEquipmentByBrand(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return { ok: true, results: [] };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!canUploadPhotos(profile.role)) return { ok: false, msg: 'Not allowed.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  const like = '%' + q.replace(/[%_,]/g, '') + '%';
  try {
    const { data, error } = await sb.from('customer_equipment')
      .select('id, type, brand, model, serial, year, fuel_type, customer_id, created_at')
      .or(`brand.ilike.${like},model.ilike.${like},serial.ilike.${like}`)
      .order('created_at', { ascending: false }).limit(25);
    if (error) return { ok: false, msg: missing(error) ? 'Run supabase/103_customer_equipment.sql first.' : error.message };
    const custIds = [...new Set((data || []).map((e) => e.customer_id).filter(Boolean))];
    const cname = {};
    if (custIds.length) { const { data: cs } = await sb.from('customers').select('id, name').in('id', custIds); (cs || []).forEach((c) => { cname[c.id] = c.name; }); }
    const results = (data || []).map((e) => ({ id: e.id, type: e.type || 'Equipment', brand: e.brand || '', model: e.model || '', year: e.year || null, fuel: e.fuel_type || '', customerId: e.customer_id || null, customer: cname[e.customer_id] || '' }));
    return { ok: true, results };
  } catch (e) { return { ok: false, msg: String(e.message || e) }; }
}

// Save a scanned data plate to the location's equipment registry (so it's on file for next time).
export async function saveEquipment(jobId, plate = {}, type = '') {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!canUploadPhotos(profile.role)) return { ok: false, msg: 'Your role can’t save equipment.' };
  const sb = getSupabaseAdmin();

  // Resolve the customer from the job so the record follows the address, not the visit.
  let customerId = null;
  try { const { data: j } = await sb.from('jobs').select('customer_id').eq('id', jobId).maybeSingle(); customerId = j?.customer_id || null; } catch (_) {}
  // Type comes from the APPLIANCE the AI detected — never the job description (that's the "Drain unclog · kitchen"
  // bug). Fall back to a passed type → generic "Equipment".
  const apptype = clean(type, 60) || APPLIANCE_LABEL[plate.appliance] || 'Equipment';
  const hp = clean(plate.horsepower, 12);
  const notesCombined = [clean(plate.notes, 360), hp ? `${hp} HP` : ''].filter(Boolean).join(' · ');

  // ⚠ Gas vs propane is a HARD safety rule — NEVER swap them (different supply line + orifice; the wrong unit
  // is dangerous). If this address's last water heater was the other gas type, flag it loudly.
  const fuelCat = (f) => { const s = String(f || '').toLowerCase(); if (/propane|lp\b/.test(s)) return 'propane'; if (/gas/.test(s)) return 'gas'; if (/electric/.test(s)) return 'electric'; return ''; };
  const newCat = fuelCat(plate.fuelType);
  let fuelWarn = null;
  if (customerId && (newCat === 'gas' || newCat === 'propane')) {
    try {
      const { data: prior } = await sb.from('customer_equipment').select('fuel_type, type, created_at').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(25);
      const priorWH = (prior || []).find((e) => !/furnace|boiler|hvac|\bac\b|softener|sump|pump/i.test(String(e.type || '')) && (fuelCat(e.fuel_type) === 'gas' || fuelCat(e.fuel_type) === 'propane'));
      const priorCat = priorWH ? fuelCat(priorWH.fuel_type) : '';
      if (priorCat && priorCat !== newCat) fuelWarn = `⚠ STOP — this address was ${priorCat.toUpperCase()} but this plate reads ${newCat === 'gas' ? 'NATURAL GAS' : newCat.toUpperCase()}. Never swap natural gas ↔ propane — different supply + orifice, it's dangerous. Confirm the gas type before you install.`;
    } catch (_) {}
  }

  const row = {
    customer_id: customerId, job_id: jobId || null, type: apptype,
    brand: clean(plate.brand, 80) || null, model: clean(plate.model, 80) || null, serial: clean(plate.serial, 80) || null,
    fuel_type: clean(plate.fuelType, 40) || null, capacity_gallons: intOrNull(plate.capacityGallons),
    year: intOrNull(plate.year), notes: notesCombined || null, confidence: clean(plate.confidence, 20) || null,
    created_by: user.id, created_by_name: profile.name || user.email,
  };
  const { error } = await sb.from('customer_equipment').insert(row);
  if (error) return { ok: false, msg: missing(error) ? 'Run supabase/103_customer_equipment.sql first.' : error.message };

  try { await sb.from('audit_log').insert({ actor_id: user.id, actor_name: profile.name || user.email, role: profile.role, action: 'equipment.save', entity: 'customer_equipment', entity_id: jobId ? String(jobId) : '', detail: { brand: row.brand, model: row.model, fuel: row.fuel_type, fuel_mismatch: !!fuelWarn } }); } catch (_) {}
  revalidatePath(`/job/${jobId}/equipment`);
  return { ok: true, msg: `Saved ${[row.brand, row.model].filter(Boolean).join(' ') || 'equipment'} to this location.`, warn: fuelWarn };
}
