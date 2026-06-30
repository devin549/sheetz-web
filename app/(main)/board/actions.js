'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { closeoutReason } from '@/lib/qa';
import { revalidatePath } from 'next/cache';
import { CANCEL_REASONS } from './boardTokens';
import { techUnavailabilityReason } from '@/lib/techAvailability';
import { nextSegmentNo } from '@/lib/segments';

// ET date string (YYYY-MM-DD) of an instant — the day the office is actually putting the job on.
const nyDateOf = (iso) => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(iso)); } catch { return null; } };

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

// Office acknowledges a tech's ETA report (seen + handled). Gated to contact-customer seats.
async function assertContact() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  if (!user || !can(profile.role, 'contactCustomer')) throw new Error('Not allowed.');
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Server not configured.');
  return { sb, user, profile };
}
export async function acknowledgeEta(etaId) {
  let ctx;
  try { ctx = await assertContact(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  if (!etaId) return { ok: false, msg: 'No report.' };
  const { error } = await ctx.sb.from('job_eta_updates')
    .update({ ack_by: ctx.user.id, ack_by_name: ctx.profile.name || ctx.user.email, ack_at: new Date().toISOString() })
    .eq('id', etaId);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/board');
  return { ok: true };
}
// Office marks the customer notified (after it actually called/texted them) → acks + logs.
export async function notifyEta(etaId) {
  let ctx;
  try { ctx = await assertContact(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  if (!etaId) return { ok: false, msg: 'No report.' };
  const nowISO = new Date().toISOString();
  const { error } = await ctx.sb.from('job_eta_updates')
    .update({ customer_notified: true, ack_by: ctx.user.id, ack_by_name: ctx.profile.name || ctx.user.email, ack_at: nowISO })
    .eq('id', etaId);
  if (error) return { ok: false, msg: error.message };
  try { await ctx.sb.from('audit_log').insert({ actor_id: ctx.user.id, actor_name: ctx.profile.name || ctx.user.email, role: ctx.profile.role, action: 'eta.notify', entity: 'eta', entity_id: String(etaId), detail: {} }); } catch (_) {}
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
    // Block assigning a job to a tech who's OFF that day (sick absence or approved time off). The job's day =
    // the new scheduled time if rescheduling, else its current time. Office must pick someone who's working.
    const onDate = nyDateOf(scheduledISO && !Number.isNaN(Date.parse(scheduledISO)) ? scheduledISO : job.scheduled_at);
    if (onDate) {
      const off = await techUnavailabilityReason(sb, techId, onDate);
      if (off) return { ok: false, msg: `${techName || 'That tech'} is off that day (${off.label}). Pick another tech or reschedule.` };
    }
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

// Add an ADDITIONAL person to a job from the board's right-click — a 2nd tech (SPLIT: commission splits
// 50/50, salary takes none) or a helper (paid at cost). Creates a job_segment under the parent; the lead
// stays put. Blocked if that tech is off that day. Mirrors the job-screen "Split / Add". Role-gated.
export async function addJobTech(jobId, techId, techName, kind) {
  let sb, email;
  try { ({ sb, email } = await assertAssigner()); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  if (!jobId || !techId) return { ok: false, msg: 'Pick a tech.' };
  const k = ['second_tech', 'helper'].includes(kind) ? kind : 'second_tech';

  // Don't add someone who's off that day, and don't add the lead twice.
  const { data: job } = await sb.from('jobs').select('tech_id, scheduled_at').eq('id', jobId).maybeSingle();
  if (!job) return { ok: false, msg: 'Job not found.' };
  if (String(job.tech_id || '') === String(techId)) return { ok: false, msg: 'That tech is already the lead on this job.' };
  const onDate = nyDateOf(job.scheduled_at);
  if (onDate) { const off = await techUnavailabilityReason(sb, techId, onDate); if (off) return { ok: false, msg: `${techName || 'That tech'} is off that day (${off.label}).` }; }

  // Already on the job as a segment?
  try { const { data: dup } = await sb.from('job_segments').select('id').eq('parent_job_id', jobId).eq('assigned_tech_id', techId).neq('status', 'cancelled').limit(1); if (dup && dup.length) return { ok: false, msg: `${techName || 'That tech'} is already on this job.` }; } catch (_) {}

  let parentNumber = '', count = 0;
  try { const { data: pj } = await sb.from('jobs').select('job_number').eq('id', jobId).maybeSingle(); parentNumber = pj?.job_number || ''; } catch (_) {}
  try { const { count: n } = await sb.from('job_segments').select('id', { count: 'exact', head: true }).eq('parent_job_id', jobId); count = n || 0; } catch (_) {}

  const row = { parent_job_id: jobId, segment_no: nextSegmentNo(parentNumber, count), kind: k, assigned_tech_id: techId, assigned_tech_name: techName || null, status: 'live_not_active', created_by_name: email };
  const { error } = await sb.from('job_segments').insert(row);
  if (error) return { ok: false, msg: /relation|column|schema cache|does not exist/i.test(error.message || '') ? 'Run supabase/87_job_segments.sql first.' : error.message };
  try { await sb.from('job_moves').insert({ job_id: jobId, action: k === 'helper' ? 'add_helper' : 'add_tech', to_tech_id: techId, to_tech_name: techName, by_email: email }); } catch (_) {}
  revalidatePath('/board');
  return { ok: true, msg: k === 'helper' ? `Helper added: ${techName || 'tech'}` : `2nd tech added — commission splits 50/50: ${techName || 'tech'}` };
}
