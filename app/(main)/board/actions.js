'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { closeoutReason } from '@/lib/qa';
import { revalidatePath } from 'next/cache';
import { CANCEL_REASONS } from './boardTokens';

// Re-check the caller's perms on every call — a server action is a public RPC, so guarding only
// the page/nav isn't enough. Role + scope come from the profile (server-authoritative).
async function assertAssigner() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  if (!user || !can(profile.role, 'assignJobs')) throw new Error('Not allowed.');
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Server not configured.');
  return { sb, email: (user.email || ''), profile };
}
async function assertStatusChanger() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  if (!user || !can(profile.role, 'changeStatus')) throw new Error('Your role can’t change job status.');
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Server not configured.');
  return { sb, email: (user.email || ''), profile };
}

// Cancel a job WITH a reason → status=cancelled + log to cancellations (feeds the AI win-back
// watcher). Mirrors cbDispatchBoard_cancelJob. Role-gated.
export async function cancelJob(jobId, reasonCode, reasonNote) {
  let sb, email;
  try { ({ sb, email } = await assertStatusChanger()); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const reason = CANCEL_REASONS.find((r) => r.code === reasonCode);
  if (!jobId || !reason) return { ok: false, msg: 'Pick a reason.' };
  if (reason.needsNote && String(reasonNote || '').trim().length < 3) return { ok: false, msg: 'Add a quick note (required for this reason).' };

  const { error } = await sb.from('jobs').update({ status: 'cancelled' }).eq('id', jobId);
  if (error) return { ok: false, msg: error.message };
  // best-effort log — never block the cancel if the table isn't there yet
  try { await sb.from('cancellations').insert({ job_id: jobId, reason_code: reasonCode, reason_note: reasonNote || '', cancelled_by: email }); } catch (_) {}
  revalidatePath('/board');
  return { ok: true };
}

// Set a job's expected duration (minutes). Mirrors cbDispatchBoard_setJobDuration.
export async function setDuration(jobId, durationMin) {
  let sb;
  try { ({ sb } = await assertStatusChanger()); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const d = Math.max(15, Math.min(720, Math.round(Number(durationMin) || 0)));
  if (!jobId || !d) return { ok: false, msg: 'Enter minutes.' };
  const { error } = await sb.from('jobs').update({ duration_min: d }).eq('id', jobId);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/board');
  return { ok: true, durationMin: d };
}

// Change a job's status (en route / on site / done / scheduled / hold). Stamps the matching
// timestamp. Role-gated (changeStatus). Mirrors cbDispatchBoard_updateJobStatus.
const VALID_STATUS = ['scheduled', 'enroute', 'on_site', 'done', 'hold', 'cancelled'];
export async function updateJobStatus(jobId, status) {
  let sb, profile;
  try { ({ sb, profile } = await assertStatusChanger()); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  if (!jobId || !VALID_STATUS.includes(status)) return { ok: false, msg: 'Bad request.' };
  // Close-gate: block 'done' until the media rule is met — unless this role can override.
  if (status === 'done' && !can(profile.role, 'qaOverride')) {
    const { data: job } = await sb.from('jobs').select('id, job_type').eq('id', jobId).maybeSingle();
    if (job) { const reason = await closeoutReason(sb, job); if (reason) return { ok: false, msg: reason, blocked: 'closeout' }; }
  }
  const patch = { status };
  const nowISO = new Date().toISOString();
  if (status === 'enroute') patch.enroute_at = nowISO;
  if (status === 'on_site') patch.started_at = nowISO;
  if (status === 'done') patch.completed_at = nowISO;
  const { error } = await sb.from('jobs').update(patch).eq('id', jobId);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/board');
  return { ok: true };
}

// Assign (or unassign) a tech to a job. techId '' or null = unassign. Optional `hour` (a float,
// e.g. 13.5 = 1:30pm) reschedules the job to TODAY at that time — used when dragging a job onto
// the grid. Sets the FK (tech_id, so My Day + the board embed resolve) + denormalized tech_name.
// `scheduledISO` is a full UTC instant computed ON THE CLIENT (browser/Eastern) from the dropped
// position — we store it as-is. We must NOT rebuild the time from an hour on the server, because
// Vercel runs in UTC and `new Date().setHours(9)` would write 9am UTC = 5am Eastern (a 4-hr shift).
export async function assignTech(jobId, techId, scheduledISO) {
  let sb, email;
  try { ({ sb, email } = await assertAssigner()); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  if (!jobId) return { ok: false, msg: 'No job.' };

  // Load current state → guard completed/cancelled jobs + capture the "from" side for the move audit.
  const { data: job } = await sb.from('jobs').select('status, tech_id, tech_name, scheduled_at').eq('id', jobId).maybeSingle();
  if (!job) return { ok: false, msg: 'Job not found.' };
  if (['done', 'cancelled'].includes(job.status)) return { ok: false, msg: `Can’t move a ${job.status} job.` };

  let techName = null;
  if (techId) {
    const { data } = await sb.from('techs').select('name').eq('id', techId).maybeSingle();
    techName = (data && data.name) || null;
  }
  const patch = {
    tech_id: techId || null,
    tech_name: techName,
    assigned_at: techId ? new Date().toISOString() : null,
  };
  if (scheduledISO && !Number.isNaN(Date.parse(scheduledISO))) patch.scheduled_at = scheduledISO;
  const { error } = await sb.from('jobs').update(patch).eq('id', jobId);
  if (error) return { ok: false, msg: error.message };

  // Move/activity audit (best-effort; the live board requires move history). Never blocks the move.
  const changedTech = String(job.tech_id || '') !== String(techId || '');
  const action = !techId ? 'unassign'
    : (job.tech_id && changedTech) ? 'reassign'
    : (!changedTech && patch.scheduled_at) ? 'reschedule'
    : 'assign';
  try {
    await sb.from('job_moves').insert({
      job_id: jobId, action,
      from_tech_id: job.tech_id || null, from_tech_name: job.tech_name || null,
      to_tech_id: techId || null, to_tech_name: techName,
      scheduled_at: patch.scheduled_at || job.scheduled_at || null, by_email: email,
    });
  } catch (_) {}
  revalidatePath('/board');
  return { ok: true };
}
