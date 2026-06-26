'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';

const KINDS = ['vacation', 'sick', 'personal', 'unpaid'];
const clean = (v, n = 300) => String(v || '').trim().slice(0, n);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const canApprove = (r) => can(r, 'manageUsers') || can(r, 'assignJobs') || can(r, 'seeCrew');

// A tech submits a time-off request → pending for a manager.
export async function requestTimeOff(form) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  const kind = KINDS.includes(form.get('kind')) ? form.get('kind') : 'vacation';
  const start = clean(form.get('start_date'), 10);
  let end = clean(form.get('end_date'), 10);
  if (!isDate(start)) return { ok: false, msg: 'Pick a start date.' };
  if (end && !isDate(end)) end = null;
  const sb = getSupabaseAdmin();
  const { error } = await sb.from('time_off_requests').insert({ user_id: user.id, tech_name: profile.name || user.email, kind, start_date: start, end_date: end || null, reason: clean(form.get('reason'), 300) || null });
  if (error) return { ok: false, msg: /relation|column|schema cache|does not exist/i.test(error.message || '') ? 'Run supabase/82_time_off.sql first.' : error.message };
  try { await sb.from('audit_log').insert({ actor_id: user.id, actor_name: profile.name || user.email, role: profile.role, action: 'timeoff.requested', entity: 'tech', entity_id: user.id, detail: { kind, start, end } }); } catch (_) {}
  revalidatePath('/pto');
  return { ok: true, msg: 'Sent to your supervisor.' };
}

// Manager approves/denies a request.
export async function decideTimeOff(id, approve, note) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!canApprove(profile.role)) return { ok: false, msg: 'Supervisors approve time off.' };
  const sb = getSupabaseAdmin();
  const { error } = await sb.from('time_off_requests').update({ status: approve ? 'approved' : 'denied', decided_by: user.id, decided_by_name: profile.name || user.email, decided_at: new Date().toISOString(), decision_note: clean(note, 200) || null }).eq('id', id);
  if (error) return { ok: false, msg: error.message };
  try { await sb.from('audit_log').insert({ actor_id: user.id, actor_name: profile.name || user.email, role: profile.role, action: approve ? 'timeoff.approved' : 'timeoff.denied', entity: 'timeoff', entity_id: String(id) }); } catch (_) {}
  revalidatePath('/pto');
  return { ok: true };
}
