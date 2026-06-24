'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { revalidatePath } from 'next/cache';
import { nyDayWindow } from '@/lib/day';
import { onsiteHours } from '@/lib/hours';

const PAYROLL_ROLES = ['owner', 'admin', 'gm', 'om', 'accounting'];
const APPROVE_ROLES = ['owner', 'admin', 'gm', 'om'];

async function gate(approve = false) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  const allowed = (approve ? APPROVE_ROLES : PAYROLL_ROLES).includes(String(profile.role).toLowerCase());
  if (!user || !allowed) throw new Error(approve ? 'Only an approver (owner/GM/OM) can approve payroll.' : 'Your role can’t run payroll.');
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Server not configured.');
  return { sb, user, profile };
}
const cents = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0; };
const clean = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const addDays = (d, n) => { const [y, m, day] = d.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, day + n)); return dt.toISOString().slice(0, 10); };

// Save a tech's pay configuration (rates).
export async function savePayRate(formData) {
  let ctx; try { ctx = await gate(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const techId = clean(formData.get('techId'), 80);
  if (!techId) return { ok: false, msg: 'No tech.' };
  const payType = ['commission', 'hourly', 'hourly_comm', 'salary'].includes(formData.get('payType')) ? formData.get('payType') : 'commission';
  const row = {
    tech_id: techId, pay_type: payType,
    commission_pct: Math.max(0, Math.min(100, Number(formData.get('commissionPct')) || 0)),
    hourly_rate: Math.max(0, Number(formData.get('hourlyRate')) || 0),
    weekly_salary: Math.max(0, Number(formData.get('weeklySalary')) || 0),
    updated_at: new Date().toISOString(),
  };
  const { error } = await ctx.sb.from('pay_profiles').upsert(row, { onConflict: 'tech_id' });
  if (error) { if (/could not find|does not exist|schema cache/i.test(error.message || '')) return { ok: false, msg: 'Run supabase/31_payroll.sql first.' }; return { ok: false, msg: error.message }; }
  revalidatePath('/payroll');
  return { ok: true, msg: 'Pay rate saved.' };
}

// Generate (or fetch) the DRAFT run for a Sun→Sat week. Commission is computed from each tech's
// completed-job revenue that week; hours are entered by the approver afterward.
export async function generateRun(weekStart) {
  let ctx; try { ctx = await gate(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const ws = clean(weekStart, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ws)) return { ok: false, msg: 'Bad week.' };
  const weekEnd = addDays(ws, 6);

  const existing = await ctx.sb.from('cb_payroll_runs').select('id').eq('week_start', ws).maybeSingle();
  if (existing.error && /could not find|does not exist|schema cache/i.test(existing.error.message || '')) return { ok: false, msg: 'Run supabase/31_payroll.sql first.' };
  if (existing.data) return { ok: true, runId: existing.data.id, msg: 'Draft already exists.' };

  const startISO = nyDayWindow(ws).startISO, endISO = nyDayWindow(weekEnd).endISO;
  const { data: jobs } = await ctx.sb.from('jobs').select('tech_id, tech_name, amount, started_at, completed_at').not('tech_id', 'is', null).gte('completed_at', startISO).lt('completed_at', endISO);
  const byTech = {};
  (jobs || []).forEach((j) => { const m = (byTech[j.tech_id] = byTech[j.tech_id] || { name: j.tech_name || '', count: 0, rev: 0, hours: 0 }); m.count++; m.rev += Number(j.amount) || 0; m.hours += onsiteHours(j.started_at, j.completed_at); if (j.tech_name) m.name = j.tech_name; });

  const { data: pays } = await ctx.sb.from('pay_profiles').select('tech_id, pay_type, commission_pct, hourly_rate, weekly_salary');
  const payByTech = {}; (pays || []).forEach((p) => { payByTech[p.tech_id] = p; });
  const { data: techs } = await ctx.sb.from('techs').select('id, name');
  const nameById = {}; (techs || []).forEach((t) => { nameById[t.id] = t.name; });

  const techIds = [...new Set([...Object.keys(byTech), ...Object.keys(payByTech)])];
  const { data: run, error: rErr } = await ctx.sb.from('cb_payroll_runs').insert({ week_start: ws, week_end: weekEnd, status: 'draft', created_by: ctx.profile.name || ctx.user.email }).select('id').single();
  if (rErr) return { ok: false, msg: rErr.message };

  const lines = techIds.map((tid) => {
    const j = byTech[tid] || { name: '', count: 0, rev: 0, hours: 0 };
    const p = payByTech[tid] || { pay_type: 'commission', commission_pct: 0, hourly_rate: 0, weekly_salary: 0 };
    const comm = ['commission', 'hourly_comm'].includes(p.pay_type) ? Math.round((j.rev * (Number(p.commission_pct) || 0) / 100) * 100) : 0;
    const hours = Math.round((j.hours || 0) * 100) / 100;                  // auto on-site hours from job timeline
    const salaryBase = p.pay_type === 'salary' ? cents(p.weekly_salary) : 0;
    const hourlyCents = ['hourly', 'hourly_comm'].includes(p.pay_type) ? Math.round(hours * (Number(p.hourly_rate) || 0) * 100) : salaryBase;
    return {
      run_id: run.id, tech_id: tid, tech_name: j.name || nameById[tid] || 'Tech', pay_type: p.pay_type,
      jobs_count: j.count, revenue_cents: Math.round(j.rev * 100), commission_cents: comm,
      hours, hourly_cents: hourlyCents, bonus_cents: 0, adjust_cents: 0,
    };
  });
  if (lines.length) { const { error: lErr } = await ctx.sb.from('cb_payroll_lines').insert(lines); if (lErr) return { ok: false, msg: lErr.message }; }
  revalidatePath('/payroll');
  return { ok: true, runId: run.id, msg: `Draft built — ${lines.length} techs.` };
}

// Approver edits a line (hours→hourly, bonus, adjust, note). Only on a DRAFT run; hourly_cents is
// computed on the client from the tech's rate and passed in.
export async function saveLine(formData) {
  let ctx; try { ctx = await gate(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const lineId = clean(formData.get('lineId'), 80);
  if (!lineId) return { ok: false, msg: 'No line.' };
  const { data: line } = await ctx.sb.from('cb_payroll_lines').select('run_id').eq('id', lineId).maybeSingle();
  if (!line) return { ok: false, msg: 'Line not found.' };
  const { data: run } = await ctx.sb.from('cb_payroll_runs').select('status').eq('id', line.run_id).maybeSingle();
  if (run?.status === 'approved') return { ok: false, msg: 'Run is approved — reopen to edit.' };

  const { error } = await ctx.sb.from('cb_payroll_lines').update({
    hours: Math.max(0, Number(formData.get('hours')) || 0),
    hourly_cents: cents(formData.get('hourly')),
    bonus_cents: cents(formData.get('bonus')),
    adjust_cents: Math.round((Number(formData.get('adjust')) || 0) * 100), // signed (can be negative)
    note: clean(formData.get('note'), 300) || null,
  }).eq('id', lineId);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/payroll');
  return { ok: true, msg: 'Saved.' };
}

// Approve the run (locks it). Never sends pay — export to the payroll file is a separate step.
export async function approveRun(runId) {
  let ctx; try { ctx = await gate(true); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const { error } = await ctx.sb.from('cb_payroll_runs').update({ status: 'approved', approved_by: ctx.profile.name || ctx.user.email, approved_at: new Date().toISOString() }).eq('id', clean(runId, 80));
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/payroll');
  return { ok: true, msg: 'Payroll approved. Export to your payroll file when ready.' };
}
export async function reopenRun(runId) {
  let ctx; try { ctx = await gate(true); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const { error } = await ctx.sb.from('cb_payroll_runs').update({ status: 'draft', approved_by: null, approved_at: null }).eq('id', clean(runId, 80));
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/payroll');
  return { ok: true, msg: 'Reopened for edits.' };
}
