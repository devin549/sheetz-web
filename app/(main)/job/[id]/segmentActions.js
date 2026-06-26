'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { can, canAny } from '@/lib/roles';
import { nextSegmentNo, SEGMENT_KINDS } from '@/lib/segments';

const KINDS = SEGMENT_KINDS.map((k) => k.kind);
const clean = (v, n = 400) => String(v == null ? '' : v).trim().slice(0, n);
const missing = (e) => /relation|column|schema cache|does not exist/i.test(e?.message || '');

async function ctx() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: 'Sign in required.' };
  return { user, profile: await loadProfile(user), sb: getSupabaseAdmin() };
}
// Dispatch / supervisor / manager may split + assign. (Field techs activate their OWN segment, below.)
const canDispatch = (role) => canAny(role, ['assignJobs', 'manageUsers', 'seeCrew', 'reassignJobs']);
async function log(sb, c, action, segId, detail) {
  try { await sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: c.profile.name || c.user.email, role: c.profile.role, action, entity: 'job_segment', entity_id: String(segId || ''), detail: detail || {} }); } catch (_) {}
}

// Create a child segment under a parent job. Defaults to LIVE_NOT_ACTIVE — on the board, assignable,
// NOT a booked job, no invoice, no customer text — exactly the spec. Never creates a separate job.
export async function createSegment(form) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  if (!canDispatch(c.profile.role)) return { ok: false, msg: 'Dispatch or a supervisor adds work segments.' };
  const parentJobId = clean(form.get('parent_job_id'), 60);
  const kind = KINDS.includes(form.get('kind')) ? form.get('kind') : 'work_segment';
  if (!parentJobId) return { ok: false, msg: 'Missing parent job.' };

  // parent number (for 104812-B) + existing count
  let parentNumber = '';
  try { const { data: pj } = await c.sb.from('jobs').select('job_number').eq('id', parentJobId).maybeSingle(); parentNumber = pj?.job_number || ''; } catch (_) {}
  let count = 0;
  try { const { count: n } = await c.sb.from('job_segments').select('id', { count: 'exact', head: true }).eq('parent_job_id', parentJobId); count = n || 0; } catch (_) {}

  const row = {
    parent_job_id: parentJobId, segment_no: nextSegmentNo(parentNumber, count), kind,
    assigned_tech_id: clean(form.get('assigned_tech_id'), 60) || null,
    assigned_tech_name: clean(form.get('assigned_tech_name'), 120) || null,
    reason: clean(form.get('reason'), 300) || null,
    scheduled_at: form.get('scheduled_at') && !Number.isNaN(Date.parse(form.get('scheduled_at'))) ? new Date(form.get('scheduled_at')).toISOString() : null,
    est_duration_min: Math.max(0, Math.round(Number(form.get('est_duration_min')) || 0)) || null,
    unit_label: clean(form.get('unit_label'), 120) || null,
    notes: clean(form.get('notes'), 1000) || null,
    counts_capacity: form.get('counts_capacity') === 'on' || form.get('counts_capacity') === 'true',
    status: 'live_not_active', // visible + assignable, but NOT a booked job / invoice / customer text
    created_by: c.user.id, created_by_name: c.profile.name || c.user.email,
  };
  const { data, error } = await c.sb.from('job_segments').insert(row).select('id, segment_no').maybeSingle();
  if (error) return { ok: false, msg: missing(error) ? 'Run supabase/87_job_segments.sql first.' : error.message };
  await log(c.sb, c, 'segment.created', data?.id, { kind, segment_no: data?.segment_no, parent: parentJobId });
  revalidatePath(`/job/${parentJobId}`);
  return { ok: true, msg: `Added ${data?.segment_no || 'segment'}.` };
}

// Activate a segment — En Route / dispatch start. Clock starts; new labor/photos/parts attach here.
export async function activateSegment(id, parentJobId) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const { data: seg } = await c.sb.from('job_segments').select('assigned_tech_id, status').eq('id', id).maybeSingle();
  if (!seg) return { ok: false, msg: 'Segment not found.' };
  const mine = seg.assigned_tech_id && seg.assigned_tech_id === c.profile.tech_id;
  if (!mine && !canDispatch(c.profile.role)) return { ok: false, msg: 'Only the assigned tech or dispatch can start this.' };
  if (seg.status === 'done' || seg.status === 'cancelled') return { ok: false, msg: 'Segment already closed.' };
  const { error } = await c.sb.from('job_segments').update({ status: 'active', started_at: new Date().toISOString() }).eq('id', id);
  if (error) return { ok: false, msg: error.message };
  await log(c.sb, c, 'segment.activated', id, {});
  if (parentJobId) revalidatePath(`/job/${parentJobId}`);
  return { ok: true };
}

// Complete a segment — freeze labor minutes, stop attaching.
export async function completeSegment(id, parentJobId) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const { data: seg } = await c.sb.from('job_segments').select('started_at, status, assigned_tech_id').eq('id', id).maybeSingle();
  if (!seg) return { ok: false, msg: 'Segment not found.' };
  const mine = seg.assigned_tech_id && seg.assigned_tech_id === c.profile.tech_id;
  if (!mine && !canDispatch(c.profile.role)) return { ok: false, msg: 'Only the assigned tech or dispatch can close this.' };
  const now = new Date();
  const laborMin = seg.started_at ? Math.max(0, Math.round((now - Date.parse(seg.started_at)) / 60000)) : 0;
  const { error } = await c.sb.from('job_segments').update({ status: 'done', ended_at: now.toISOString(), labor_min: laborMin }).eq('id', id);
  if (error) return { ok: false, msg: error.message };
  await log(c.sb, c, 'segment.completed', id, { labor_min: laborMin });
  if (parentJobId) revalidatePath(`/job/${parentJobId}`);
  return { ok: true };
}

export async function setSegmentStatus(id, status, parentJobId) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  if (!canDispatch(c.profile.role)) return { ok: false, msg: 'Dispatch only.' };
  if (!['draft', 'live_not_active', 'cancelled'].includes(status)) return { ok: false, msg: 'Use activate/complete for those.' };
  const { error } = await c.sb.from('job_segments').update({ status }).eq('id', id);
  if (error) return { ok: false, msg: error.message };
  await log(c.sb, c, 'segment.status', id, { status });
  if (parentJobId) revalidatePath(`/job/${parentJobId}`);
  return { ok: true };
}
