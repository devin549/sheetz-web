'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { revalidatePath } from 'next/cache';
import { ALL_SCANS } from '@/lib/alertScans';
import { createAlert } from '@/lib/alerts';

async function assertOffice() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  if (!user || !(can(profile.role, 'seeReports') || can(profile.role, 'assignJobs') || can(profile.role, 'manageUsers'))) throw new Error('Not allowed.');
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Server not configured.');
  return { sb, user, profile };
}
const clean = (v, n = 300) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);

export async function addTask(formData) {
  let ctx; try { ctx = await assertOffice(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const title = clean(formData.get('title'), 200);
  if (!title) return { ok: false, msg: 'Enter a task.' };
  const due = clean(formData.get('due'), 20);
  const priority = ['low', 'normal', 'high'].includes(formData.get('priority')) ? formData.get('priority') : 'normal';
  const { error } = await ctx.sb.from('tasks').insert({
    title, detail: clean(formData.get('detail'), 500) || null, assignee: clean(formData.get('assignee'), 120) || null,
    due_date: due && !Number.isNaN(Date.parse(due)) ? due : null, priority, created_by: ctx.profile.name || ctx.user.email,
  });
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/tasks');
  return { ok: true, msg: 'Task added.' };
}

export async function completeTask(id) {
  let ctx; try { ctx = await assertOffice(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const { error } = await ctx.sb.from('tasks').update({ status: 'done', done_at: new Date().toISOString() }).eq('id', clean(id, 80));
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/tasks');
  return { ok: true };
}

export async function reopenTask(id) {
  let ctx; try { ctx = await assertOffice(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const { error } = await ctx.sb.from('tasks').update({ status: 'open', done_at: null }).eq('id', clean(id, 80));
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/tasks');
  return { ok: true };
}

export async function dismissTask(id) {
  let ctx; try { ctx = await assertOffice(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const { error } = await ctx.sb.from('tasks').update({ status: 'dismissed', done_at: new Date().toISOString(), resolved_by: ctx.profile.name || ctx.user.email }).eq('id', clean(id, 80));
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/tasks');
  return { ok: true };
}

// Manager-triggered run of the P4 trigger brain (same scanners as the cron, no secret needed — the
// caller is already an authenticated office user). Creates/bumps in-app alert tasks; never emails.
export async function runChecksNow() {
  let ctx; try { ctx = await assertOffice(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const now = Date.now();
  let created = 0, found = 0;
  for (const scan of ALL_SCANS) {
    let hits = []; try { hits = (await scan(ctx.sb, now)) || []; } catch (_) { hits = []; }
    found += hits.length;
    for (const a of hits) { const r = await createAlert(ctx.sb, { ...a, nowISO: new Date(now).toISOString() }); if (r.ok && r.created) created++; if (r.error && /86_task_alerts/.test(r.error)) return { ok: false, msg: 'Run supabase/86_task_alerts.sql first.' }; }
  }
  revalidatePath('/tasks');
  return { ok: true, msg: created ? `${created} new alert${created > 1 ? 's' : ''} (${found} conditions checked).` : `All clear — ${found} conditions checked, nothing new.` };
}
