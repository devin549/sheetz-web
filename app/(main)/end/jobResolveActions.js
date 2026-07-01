'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { loadJob, canViewJob } from '../job/[id]/jobAccess';

const clean = (v, n = 300) => String(v == null ? '' : v).trim().slice(0, n);
const softCol = (e) => /column|schema cache|does not exist/i.test(e?.message || '');
const isClosed = (s) => /done|complete|closed|cancel/i.test(String(s || ''));

async function ctx() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: 'Sign in required.' };
  return { user, profile: await loadProfile(user), sb: getSupabaseAdmin() };
}

// SECURITY (audit P1-8): these actions mutate `jobs` by a client-supplied id on the service-role key. The
// bare ctx() only checked "signed in", so any principal (viewer/helper/customer/another tech) could
// reschedule/hold/reopen ANY job. Load the job and require both a status perm AND that the caller can view it.
async function gateJob(c, jobId) {
  if (!c.sb) return { err: 'Server not configured.' };
  if (!(can(c.profile.role, 'changeStatus') || can(c.profile.role, 'assignJobs'))) return { err: 'Your role can’t change a job.' };
  const { data: job } = await loadJob(c.sb, jobId);
  if (!job) return { err: 'Job not found.' };
  if (!(await canViewJob(c.sb, c.user, c.profile, c.profile.role, job))) return { err: 'That job isn’t assigned to you.' };
  return { job };
}
async function log(sb, c, action, jobId, detail) {
  try { await sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: c.profile.name || c.user.email, role: c.profile.role, action, entity: 'job', entity_id: String(jobId || ''), detail: detail || {} }); } catch (_) {}
}

// Roll an unfinished job to another day — keeps the SAME job (parts, photos, history intact); just moves
// the schedule. Default = tomorrow, same time. The tech can only roll their own job.
export async function rollOverJob(jobId, toISO) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const g = await gateJob(c, jobId); if (g.err) return { ok: false, msg: g.err };
  const j = g.job;
  if (isClosed(j.status)) return { ok: false, msg: 'That job is already closed — can’t roll it over.' };
  let when = toISO && !Number.isNaN(Date.parse(toISO)) ? new Date(toISO) : null;
  if (!when) { const base = j.scheduled_at ? new Date(j.scheduled_at) : new Date(); base.setDate(base.getDate() + 1); when = base; }
  const { error } = await c.sb.from('jobs').update({ scheduled_at: when.toISOString(), status: 'scheduled' }).eq('id', jobId);
  if (error) return { ok: false, msg: error.message };
  await log(c.sb, c, 'job.rolled_over', jobId, { to: when.toISOString() });
  revalidatePath('/end'); revalidatePath('/my-day');
  return { ok: true, msg: `Rolled to ${when.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} — same job, parts & history kept.` };
}

// "Couldn't do it" — close the job out without work, with a REQUIRED reason (no-show, parts, etc.). Goes
// to 'hold' (office re-dispatches) so it's not silently lost, and the reason is logged.
export async function markJobUnable(jobId, reason) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const r = clean(reason, 300);
  if (!r) return { ok: false, msg: 'Add a quick reason (no-show, needs parts, customer cancelled…).' };
  const g = await gateJob(c, jobId); if (g.err) return { ok: false, msg: g.err };
  const j = g.job;
  const note = `[EOD couldn't complete: ${r}]${j.notes ? ' ' + j.notes : ''}`.slice(0, 1000);
  const { error } = await c.sb.from('jobs').update({ status: 'hold', notes: note }).eq('id', jobId);
  if (error) return { ok: false, msg: error.message };
  await log(c.sb, c, 'job.unable', jobId, { reason: r });
  revalidatePath('/end'); revalidatePath('/my-day');
  return { ok: true, msg: 'Sent back to the office to re-dispatch.' };
}

// Back on the clock — a call came in after clock-out. Re-opens today's End-of-Day and (if given) tags the
// new job as after-hours/on-call so it counts toward on-call pay.
export async function reopenDay(newJobId) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const day = new Date().toISOString().slice(0, 10);
  try {
    const key = c.profile.tech_id;
    const q = key ? await c.sb.from('sod_checks').select('id').eq('tech_id', key).eq('day', day).maybeSingle()
      : await c.sb.from('sod_checks').select('id').eq('tech_name', c.profile.name || c.user.email).eq('day', day).maybeSingle();
    if (q.data) await c.sb.from('sod_checks').update({ eod_done: false, eod_done_at: null }).eq('id', q.data.id);
  } catch (_) {}
  if (newJobId) {
    const g = await gateJob(c, newJobId); if (g.err) return { ok: false, msg: g.err }; // scope the after-hours flag to the caller's job
    try { const { error } = await c.sb.from('jobs').update({ after_hours: true }).eq('id', newJobId); if (error && !softCol(error)) {/* ignore */} } catch (_) {}
  }
  await log(c.sb, c, 'eod.reopened', newJobId || '', { reason: 'after-hours call' });
  revalidatePath('/end'); revalidatePath('/my-day');
  return { ok: true, msg: 'Back on the clock — work the call, then clock out again when you’re done.' };
}
