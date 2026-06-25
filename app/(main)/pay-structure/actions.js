'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';

const clean = (v, n = 60) => String(v || '').replace(/[ -]/g, ' ').trim().slice(0, n);
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

async function ownerCtx() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!can(profile.role, 'manageUsers') && !can(profile.role, 'seeFinancials')) return { ok: false, msg: 'Owner / GM / accounting only.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  return { ok: true, sb };
}

// Add or edit a pay structure (the markup/premium/cap/threshold constants). $ inputs → cents.
export async function saveStructure(formData) {
  const c = await ownerCtx(); if (!c.ok) return c;
  const name = clean(formData.get('name'), 40).toLowerCase().replace(/[^a-z0-9_]/g, '') || null;
  if (!name) return { ok: false, msg: 'Give the structure a short id (e.g. cb, flat, helper).' };
  const row = {
    name,
    label: clean(formData.get('label'), 60) || name,
    dispatch_fee_cap_cents: Math.max(0, Math.round(num(formData.get('dispatch_cap')) * 100)),
    material_threshold_cents: Math.max(0, Math.round(num(formData.get('threshold')) * 100)),
    markup_low: Math.max(0, num(formData.get('markup_low'), 2)),
    markup_high: Math.max(0, num(formData.get('markup_high'), 1.5)),
    premium_low_pct: Math.max(0, num(formData.get('premium_low'), 10)),
    premium_high_pct: Math.max(0, num(formData.get('premium_high'), 5)),
    default_commission_pct: Math.max(0, Math.min(100, num(formData.get('default_commission')))),
    updated_at: new Date().toISOString(),
  };
  const { error } = await c.sb.from('pay_structures').upsert(row, { onConflict: 'name' });
  if (error) return { ok: false, msg: /pay_structures|column|schema cache|does not exist/i.test(error.message || '') ? 'Run supabase/73_pay_structure.sql first.' : error.message };
  revalidatePath('/pay-structure'); revalidatePath('/pay');
  return { ok: true, msg: `Saved “${row.label}”.` };
}
