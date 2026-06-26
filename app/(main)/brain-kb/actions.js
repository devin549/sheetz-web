'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { canAny } from '@/lib/roles';

// Plumber's Brain knowledge base — office/managers feed manufacturer guidance, fixes, and code notes that
// ground the public /api/ask answers. Write-gated to office roles (it shapes what customers are told).
const clean = (v, n = 4000) => String(v == null ? '' : v).trim().slice(0, n);
const missing = (e) => /relation|column|schema cache|does not exist/i.test(e?.message || '');
const canFeed = (r) => canAny(r, ['seeReports', 'manageUsers', 'seeFinancials']);

async function ctx() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!canFeed(profile.role)) return { err: 'Office / manager only.' };
  return { user, profile, sb: getSupabaseAdmin() };
}

export async function addKbEntry(form) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const topic = clean(form?.topic, 160), body = clean(form?.body, 4000);
  if (!topic || !body) return { ok: false, msg: 'Topic and the knowledge text are both required.' };
  const tags = clean(form?.tags, 300).split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  const row = {
    topic, body, tags,
    category: clean(form?.category, 40) || null,
    source_label: clean(form?.source_label, 160) || null,
    source_url: clean(form?.source_url, 300) || null,
    created_by_name: c.profile.name || c.user.email,
  };
  const { error } = await c.sb.from('brain_kb').insert(row);
  if (error) return { ok: false, msg: missing(error) ? 'Run supabase/112_brain_kb.sql first.' : error.message };
  revalidatePath('/brain-kb');
  return { ok: true, msg: 'Added — the Brain can use it now.' };
}

export async function toggleKbEntry(id, active) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const { error } = await c.sb.from('brain_kb').update({ active: !!active, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/brain-kb'); return { ok: true };
}

export async function deleteKbEntry(id) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const { error } = await c.sb.from('brain_kb').delete().eq('id', id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/brain-kb'); return { ok: true };
}
