'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { revalidatePath } from 'next/cache';

// Who works the shop counter (issue parts to jobs).
const MANAGE = ['owner', 'admin', 'gm', 'om', 'shop', 'fs', 'foreman'];

async function gate() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  if (!user || !MANAGE.includes(String(profile.role || '').toLowerCase())) return null;
  return { user, profile, sb: getSupabaseAdmin() };
}
const missing = (e) => /could not find|does not exist|schema cache/i.test(e?.message || '');
const clean = (v, n = 200) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);

// Reid adds a part to shop stock WITH the names the guys call it — so Hook's locator finds it by any
// alias. Writes the part to item_locations (shop) + each alias to part_aliases.
export async function addPart(formData) {
  const g = await gate();
  if (!g) return { ok: false, msg: 'Your role can’t manage shop parts.' };
  const name = clean(formData.get('name'), 120);
  if (!name) return { ok: false, msg: 'Part name required.' };
  const sku = clean(formData.get('sku'), 60) || null;
  const bin = clean(formData.get('bin'), 40) || null;
  const qty = Math.max(0, Number(formData.get('qty')) || 0);
  const locationId = clean(formData.get('location_id'), 60) || 'richmond';
  try {
    const { error } = await g.sb.from('item_locations').insert({ name, sku, location_type: 'shop', location_id: locationId, qty, bin });
    if (error) return { ok: false, msg: /relation|column|schema cache|does not exist/i.test(error.message || '') ? 'Run supabase/89_inventory_locate.sql first.' : error.message };
  } catch (e) { return { ok: false, msg: String(e?.message || e) }; }
  const aliases = [...new Set(String(formData.get('alias') || '').split(/[,;\n]/).map((s) => clean(s, 60)).filter(Boolean))].slice(0, 12);
  if (aliases.length) { try { await g.sb.from('part_aliases').insert(aliases.map((a) => ({ name, sku, alias: a, created_by: g.user.id }))); } catch (_) {} }
  revalidatePath('/shop');
  return { ok: true, msg: `Added ${name}${aliases.length ? ` + ${aliases.length} name${aliases.length > 1 ? 's' : ''}` : ''}.` };
}

// Issue a part/material (or a rental) to a JOB#. Cost lands on the job, not the tech.
export async function issueToJob(formData) {
  const g = await gate();
  if (!g) return { ok: false, msg: 'Your role can’t work the shop counter.' };
  if (!g.sb) return { ok: false, msg: 'Server not configured.' };

  const item_name = clean(formData.get('item_name'), 120);
  const job_id = clean(formData.get('job_id'), 40);
  if (!item_name) return { ok: false, msg: 'What item?' };
  if (!job_id) return { ok: false, msg: 'Which JOB# does this cost hit?' };

  const kind = formData.get('kind') === 'rental' ? 'rental' : 'issue';
  const qty = Math.max(0, Number(formData.get('qty')) || 1);
  const unit = clean(formData.get('unit'), 12) || 'ea';
  const unit_cost_cents = Math.round((Number(formData.get('unit_cost')) || 0) * 100);
  const rental_daily_cents = kind === 'rental' ? Math.round((Number(formData.get('rental_daily')) || 0) * 100) : null;
  const rental_days = kind === 'rental' ? Math.max(0, parseInt(formData.get('rental_days'), 10) || 0) : null;
  const total_cost_cents = kind === 'rental' ? (rental_daily_cents || 0) * (rental_days || 0) : Math.round(unit_cost_cents * qty);

  const row = {
    job_id, customer: clean(formData.get('customer'), 120) || null,
    item_name, sku: clean(formData.get('sku'), 60) || null,
    qty, unit, unit_cost_cents, total_cost_cents, kind, rental_daily_cents, rental_days,
    status: 'out', issued_to: clean(formData.get('issued_to'), 80) || null,
    note: clean(formData.get('note'), 300) || null, issued_by: g.profile.name || g.user.email,
  };
  const { error } = await g.sb.from('shop_issues').insert(row);
  if (error) return { ok: false, msg: missing(error) ? 'Run supabase/46_shop_issues.sql first.' : error.message };
  revalidatePath('/shop');
  return { ok: true, msg: `${kind === 'rental' ? 'Rental' : 'Issued'} ${item_name} → job #${job_id}.` };
}

// Mark a rental/issue returned.
export async function markReturned(id) {
  const g = await gate();
  if (!g) return { ok: false, msg: 'Not allowed.' };
  const { error } = await g.sb.from('shop_issues').update({ status: 'returned', returned_at: new Date().toISOString(), returned_by: g.profile.name || g.user.email }).eq('id', id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/shop');
  return { ok: true, msg: 'Marked returned.' };
}
