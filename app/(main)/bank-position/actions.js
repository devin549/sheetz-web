'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { revalidatePath } from 'next/cache';

const MANAGE = ['owner', 'admin', 'gm', 'om', 'accounting'];
const KINDS = ['checking', 'savings', 'cash', 'credit'];

async function gate() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  if (!user || !MANAGE.includes(String(profile.role || '').toLowerCase())) return { ok: false, msg: 'Your role can’t edit bank accounts.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  return { ok: true, sb, who: profile.name || user.email };
}
const missing = (e) => /could not find|does not exist|schema cache/i.test(e?.message || '');

export async function saveBankAccount(formData) {
  const g = await gate();
  if (!g.ok) return g;

  const id = String(formData.get('id') || '').trim() || null;
  const name = String(formData.get('name') || '').trim().slice(0, 120);
  const kind = KINDS.includes(formData.get('kind')) ? formData.get('kind') : 'checking';
  const balance_cents = Math.round((Number(formData.get('balance')) || 0) * 100);
  const as_of = String(formData.get('as_of') || '').slice(0, 10) || null;
  const note = String(formData.get('note') || '').trim().slice(0, 300) || null;
  if (!name) return { ok: false, msg: 'Account name is required.' };

  const row = { name, kind, balance_cents, note, updated_at: new Date().toISOString(), updated_by: g.who };
  if (as_of) row.as_of = as_of;
  const q = id ? g.sb.from('bank_accounts').update(row).eq('id', id) : g.sb.from('bank_accounts').insert(row);
  const { error } = await q;
  if (error) return { ok: false, msg: missing(error) ? 'Run supabase/36_bank_position.sql first.' : error.message };
  revalidatePath('/bank-position');
  return { ok: true, msg: 'Saved.' };
}

export async function deleteBankAccount(id) {
  const g = await gate();
  if (!g.ok) return g;
  const { error } = await g.sb.from('bank_accounts').delete().eq('id', id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/bank-position');
  return { ok: true, msg: 'Removed.' };
}
