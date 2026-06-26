'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';

async function ctx() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!(can(profile.role, 'createJobs') || can(profile.role, 'assignJobs') || can(profile.role, 'manageUsers'))) return { err: 'Not allowed.' };
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

// Link an existing job (a visit) to a project + unit.
export async function linkJobToUnit(projectId, unitId, jobId) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const { error } = await c.sb.from('jobs').update({ project_id: projectId, project_unit_id: unitId || null }).eq('id', jobId);
  if (error) return { ok: false, msg: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}
