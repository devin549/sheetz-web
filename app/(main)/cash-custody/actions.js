'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { revalidatePath } from 'next/cache';

const ROLES = ['owner', 'admin', 'gm', 'om', 'accounting'];

async function gate() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  if (!user || !ROLES.includes(String(profile.role).toLowerCase())) throw new Error('Your role can’t manage cash custody.');
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Server not configured.');
  return { sb, user, profile };
}
const clean = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const cents = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0; };
const who = (ctx) => ctx.profile.name || ctx.user.email;

export async function logCash(formData) {
  let ctx; try { ctx = await gate(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const amount = cents(formData.get('amount'));
  if (!amount) return { ok: false, msg: 'Enter an amount.' };
  const { error } = await ctx.sb.from('cash_custody').insert({
    tech_id: clean(formData.get('techId'), 80) || null, tech_name: clean(formData.get('techName'), 120) || null,
    job_id: clean(formData.get('jobId'), 80) || null, customer: clean(formData.get('customer'), 160) || null,
    amount_cents: amount, note: clean(formData.get('note'), 300) || null, collected_by: who(ctx),
  });
  if (error) { if (/could not find|does not exist|schema cache/i.test(error.message || '')) return { ok: false, msg: 'Run supabase/33_cash_custody.sql first.' }; return { ok: false, msg: error.message }; }
  revalidatePath('/cash-custody');
  return { ok: true, msg: 'Cash logged — with the tech.' };
}

export async function receiveCash(id) {
  let ctx; try { ctx = await gate(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const { error } = await ctx.sb.from('cash_custody').update({ status: 'turned_in', received_by: who(ctx), received_at: new Date().toISOString() }).eq('id', clean(id, 80)).eq('status', 'collected');
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/cash-custody');
  return { ok: true, msg: 'Marked turned in.' };
}

export async function depositCash(formData) {
  let ctx; try { ctx = await gate(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const ref = clean(formData.get('depositRef'), 80);
  const { error } = await ctx.sb.from('cash_custody').update({ status: 'deposited', deposit_ref: ref || null, deposited_at: new Date().toISOString() }).eq('id', clean(formData.get('id'), 80)).in('status', ['turned_in', 'collected']);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/cash-custody');
  return { ok: true, msg: 'Marked deposited.' };
}

export async function flagMissing(id) {
  let ctx; try { ctx = await gate(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const { error } = await ctx.sb.from('cash_custody').update({ status: 'missing' }).eq('id', clean(id, 80));
  if (error) return { ok: false, msg: error.message };
  try { await ctx.sb.from('audit_log').insert({ actor_id: ctx.user.id, actor_name: who(ctx), role: ctx.profile.role, action: 'cash.missing', entity: 'cash_custody', entity_id: clean(id, 80), detail: {} }); } catch (_) {}
  revalidatePath('/cash-custody');
  return { ok: true, msg: 'Flagged missing.' };
}
