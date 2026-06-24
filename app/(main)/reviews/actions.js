'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { revalidatePath } from 'next/cache';

const MANAGE = ['owner', 'admin', 'gm', 'om', 'csr', 'dispatcher', 'marketing', 'sales'];

async function gate() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  if (!user || !MANAGE.includes(String(profile.role || '').toLowerCase())) return { ok: false, msg: 'Your role can’t log reviews.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  return { ok: true, sb, who: profile.name || user.email };
}
const missing = (e) => /could not find|does not exist|schema cache/i.test(e?.message || '');

export async function createReview(formData) {
  const g = await gate();
  if (!g.ok) return g;

  const customer_name = String(formData.get('customer_name') || '').trim().slice(0, 160) || null;
  const rating = Math.max(1, Math.min(5, Math.round(Number(formData.get('rating')) || 5)));
  const source = String(formData.get('source') || 'Google').slice(0, 40);
  const tech_name = String(formData.get('tech_name') || '').trim().slice(0, 120) || null;
  const text = String(formData.get('text') || '').trim().slice(0, 2000) || null;

  const { error } = await g.sb.from('reviews').insert({ customer_name, rating, source, tech_name, text, created_by: g.who });
  if (error) return { ok: false, msg: missing(error) ? 'Run supabase/37_reviews.sql first.' : error.message };
  revalidatePath('/reviews');
  revalidatePath('/board');
  return { ok: true, msg: `Logged ${rating}★ review.` };
}

export async function markResponded(id) {
  const g = await gate();
  if (!g.ok) return g;
  const { error } = await g.sb.from('reviews').update({ responded: true, responded_by: g.who, responded_at: new Date().toISOString() }).eq('id', id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/reviews');
  return { ok: true, msg: 'Marked handled.' };
}
