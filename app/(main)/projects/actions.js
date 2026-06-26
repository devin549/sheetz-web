'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';

async function ctx(field = false) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: 'Sign in required.' };
  const profile = await loadProfile(user);
  // Office (createProject/addUnit) needs createJobs/assignJobs/manageUsers; field tasks (link a visit /
  // read the picker) also allow a tech who can change job status — they tag their own visit to a unit.
  const ok = can(profile.role, 'createJobs') || can(profile.role, 'assignJobs') || can(profile.role, 'manageUsers') || (field && can(profile.role, 'changeStatus'));
  if (!ok) return { err: 'Not allowed.' };
  return { user, profile, sb: getSupabaseAdmin() };
}
const clean = (v, n = 200) => String(v || '').trim().slice(0, n);

export async function createProject(form) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const name = clean(form.get('name'));
  if (!name) return { ok: false, msg: 'Project name required.' };
  const row = {
    name, site_address: clean(form.get('site_address')) || null, billing_address: clean(form.get('billing_address')) || null,
    customer_id: clean(form.get('customer_id')) || null, target_completion: clean(form.get('target_completion')) || null,
    tech_id: c.profile.tech_id || null, created_by: c.user.id,
  };
  const { data, error } = await c.sb.from('projects').insert(row).select('id').single();
  if (error) return { ok: false, msg: /relation|column|schema cache|does not exist/i.test(error.message || '') ? 'Run supabase/80_projects.sql first.' : error.message };
  revalidatePath('/projects');
  return { ok: true, id: data.id };
}

export async function addUnit(projectId, label, sort) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  if (!clean(label)) return { ok: false, msg: 'Unit label required.' };
  const { error } = await c.sb.from('project_units').insert({ project_id: projectId, label: clean(label, 80), sort: Number(sort) || 0 });
  if (error) return { ok: false, msg: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function setProjectStatus(projectId, status, holdReason) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  if (!['active', 'on_hold', 'done', 'cancelled'].includes(status)) return { ok: false, msg: 'Bad status.' };
  const { error } = await c.sb.from('projects').update({ status, hold_reason: status === 'on_hold' ? clean(holdReason) : null }).eq('id', projectId);
  if (error) return { ok: false, msg: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

// Active projects + their units, for the cockpit "link this job" picker.
export async function listProjectsWithUnits() {
  const c = await ctx(); if (c.err) return { ok: false, projects: [] };
  try {
    const { data: projects } = await c.sb.from('projects').select('id, name').neq('status', 'cancelled').order('created_at', { ascending: false }).limit(60);
    const ids = (projects || []).map((p) => p.id);
    const unitsByProject = {};
    if (ids.length) { const { data: units } = await c.sb.from('project_units').select('id, label, project_id').in('project_id', ids).order('sort', { ascending: true }); (units || []).forEach((u) => { (unitsByProject[u.project_id] = unitsByProject[u.project_id] || []).push(u); }); }
    return { ok: true, projects: (projects || []).map((p) => ({ id: p.id, name: p.name, units: unitsByProject[p.id] || [] })) };
  } catch { return { ok: false, projects: [] }; }
}

// Link an existing job (a visit) to a project + unit. MANAGERS only — keeps every tech from moving jobs.
export async function linkJobToUnit(projectId, unitId, jobId) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const { error } = await c.sb.from('jobs').update({ project_id: projectId, project_unit_id: unitId || null }).eq('id', jobId);
  if (error) return { ok: false, msg: error.message };
  if (projectId) revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/job/${jobId}`);
  return { ok: true };
}

// A tech FLAGS a job as likely part of a bigger project — goes to the manager radar, never a direct move.
export async function flagProjectCandidate(jobId, note) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  const sb = getSupabaseAdmin();
  try { await sb.from('audit_log').insert({ actor_id: user.id, actor_name: profile.name || user.email, role: profile.role, action: 'project.flagged', entity: 'job', entity_id: String(jobId), detail: { note: clean(note, 240) } }); } catch (_) { return { ok: false, msg: 'Couldn’t flag right now.' }; }
  return { ok: true, msg: 'Flagged for a manager to review.' };
}

// Manager: turn a detected candidate (a site/customer with several jobs) into a project + pull the jobs in.
export async function createProjectFromCandidate({ name, customerId, siteAddress, jobIds }) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  if (!clean(name)) return { ok: false, msg: 'Name required.' };
  const { data, error } = await c.sb.from('projects').insert({ name: clean(name), customer_id: customerId || null, site_address: clean(siteAddress) || null, created_by: c.user.id }).select('id').single();
  if (error) return { ok: false, msg: /relation|column|schema cache|does not exist/i.test(error.message || '') ? 'Run supabase/80_projects.sql first.' : error.message };
  if (Array.isArray(jobIds) && jobIds.length) { try { await c.sb.from('jobs').update({ project_id: data.id }).in('id', jobIds.map(String)); } catch (_) {} }
  revalidatePath('/projects');
  return { ok: true, id: data.id };
}
