'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { revalidatePath } from 'next/cache';

async function gate() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  if (!user || !(can(profile.role, 'seeReports') || can(profile.role, 'contactCustomer') || can(profile.role, 'createJobs'))) throw new Error('Not allowed.');
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Server not configured.');
  return { sb, user, profile };
}
const clean = (v, n = 80) => String(v || '').trim().slice(0, n);

export async function logContact(id) {
  let ctx; try { ctx = await gate(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const pid = clean(id);
  const { data: cur } = await ctx.sb.from('proposals').select('contact_count').eq('id', pid).maybeSingle();
  if (!cur) return { ok: false, msg: 'Estimate not found.' };
  const { error } = await ctx.sb.from('proposals').update({ contacted_at: new Date().toISOString(), contact_count: (cur.contact_count || 0) + 1 }).eq('id', pid);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/open-estimates');
  return { ok: true, msg: 'Contact logged.' };
}

export async function setOutcome(id, outcome) {
  let ctx; try { ctx = await gate(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  if (!['won', 'lost'].includes(outcome)) return { ok: false, msg: 'Won or lost?' };
  const { error } = await ctx.sb.from('proposals')
    .update({ outcome, status: outcome, outcome_at: new Date().toISOString(), outcome_by: ctx.profile.name || ctx.user.email })
    .eq('id', clean(id));
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/open-estimates');
  return { ok: true, msg: outcome === 'won' ? 'Marked won 🎉' : 'Marked lost.' };
}
