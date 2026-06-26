'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { canUploadPhotos } from '../jobAccess';

const clean = (v, n = 120) => String(v == null ? '' : v).trim().slice(0, n);
const intOrNull = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const missing = (e) => /relation|column|schema cache|does not exist/i.test(e?.message || '');

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
  try { const { data: j } = await sb.from('jobs').select('customer_id, job_type').eq('id', jobId).maybeSingle(); customerId = j?.customer_id || null; if (!type) type = j?.job_type || ''; } catch (_) {}

  const row = {
    customer_id: customerId, job_id: jobId || null, type: clean(type, 60) || 'Equipment',
    brand: clean(plate.brand, 80) || null, model: clean(plate.model, 80) || null, serial: clean(plate.serial, 80) || null,
    fuel_type: clean(plate.fuelType, 40) || null, capacity_gallons: intOrNull(plate.capacityGallons),
    year: intOrNull(plate.year), notes: clean(plate.notes, 400) || null, confidence: clean(plate.confidence, 20) || null,
    created_by: user.id, created_by_name: profile.name || user.email,
  };
  const { error } = await sb.from('customer_equipment').insert(row);
  if (error) return { ok: false, msg: missing(error) ? 'Run supabase/103_customer_equipment.sql first.' : error.message };

  try { await sb.from('audit_log').insert({ actor_id: user.id, actor_name: profile.name || user.email, role: profile.role, action: 'equipment.save', entity: 'customer_equipment', entity_id: jobId ? String(jobId) : '', detail: { brand: row.brand, model: row.model, fuel: row.fuel_type } }); } catch (_) {}
  revalidatePath(`/job/${jobId}/equipment`);
  return { ok: true, msg: `Saved ${[row.brand, row.model].filter(Boolean).join(' ') || 'equipment'} to this location.` };
}
