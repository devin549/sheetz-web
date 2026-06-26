'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { canAny } from '@/lib/roles';

const clean = (v, n = 400) => String(v == null ? '' : v).trim().slice(0, n);
const STATUS = ['new', 'reviewing', 'approved', 'sold', 'declined'];

// Sales/GM/OM move a referral through its lifecycle (reviewing → approved → sold / declined).
export async function setReferralStatus(id, status, note) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!canAny(profile.role, ['seeReports', 'assignJobs', 'manageUsers', 'seeFinancials', 'seeCrew'])) return { ok: false, msg: 'Sales / manager only.' };
  if (!STATUS.includes(status)) return { ok: false, msg: 'Bad status.' };
  const sb = getSupabaseAdmin();
  const { error } = await sb.from('sales_referrals').update({ status, reviewed_by: profile.name || user.email, reviewed_at: new Date().toISOString(), outcome_note: clean(note, 400) || null }).eq('id', id);
  if (error) return { ok: false, msg: error.message };
  try { await sb.from('audit_log').insert({ actor_id: user.id, actor_name: profile.name || user.email, role: profile.role, action: 'referral.status', entity: 'sales_referral', entity_id: String(id), detail: { status } }); } catch (_) {}
  revalidatePath('/referrals');
  return { ok: true, msg: `Marked ${status}.` };
}
