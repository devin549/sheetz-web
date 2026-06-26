'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { canAny } from '@/lib/roles';
import { MANAGER_DECISIONS } from '@/lib/helpers';

const DECISIONS = MANAGER_DECISIONS.map((d) => d.value);
const clean = (v, n = 500) => String(v == null ? '' : v).trim().slice(0, n);

// A manager assigns where the helper's idle cost lands. The helper is ALREADY PAID — this is cost
// attribution + an audit trail, never a wage deduction. payroll_status tracks follow-through.
export async function decideWaste(id, decision, { note = '', payrollStatus = 'applied' } = {}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!canAny(profile.role, ['manageUsers', 'seeReports', 'seeCrew', 'assignJobs'])) return { ok: false, msg: 'Manager access required.' };
  if (!DECISIONS.includes(decision)) return { ok: false, msg: 'Unknown decision.' };
  const ps = ['pending', 'applied', 'waived'].includes(payrollStatus) ? payrollStatus : 'applied';

  const sb = getSupabaseAdmin();
  const { error } = await sb.from('helper_waste').update({
    manager_decision: decision, decided_by: profile.name || user.email, decided_at: new Date().toISOString(),
    decision_note: clean(note, 500) || null, payroll_status: ps,
  }).eq('id', id);
  if (error) return { ok: false, msg: /relation|column|schema cache|does not exist/i.test(error.message || '') ? 'Run supabase/87_job_segments.sql first.' : error.message };
  try { await sb.from('audit_log').insert({ actor_id: user.id, actor_name: profile.name || user.email, role: profile.role, action: 'waste.decided', entity: 'helper_waste', entity_id: String(id), detail: { decision, payroll_status: ps } }); } catch (_) {}
  revalidatePath('/helper-waste');
  return { ok: true };
}
