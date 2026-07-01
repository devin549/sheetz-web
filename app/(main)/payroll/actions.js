'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { revalidatePath } from 'next/cache';
import { nyDayWindow } from '@/lib/day';
import { onsiteHours } from '@/lib/hours';
import { computeP3 } from '@/lib/payrollAdjust';
import { holidaysForYear } from '@/lib/holidays';
import { computeJobPay } from '@/lib/pay';
import { splitCommission } from '@/lib/segments';

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
  // SECURITY/MONEY (audit P0-2): pull the cost inputs so commission is computed on the CB NET base (not gross),
  // and EXCLUDE cancelled/held jobs (a completed-then-cancelled job kept its completed_at + amount and was
  // still being paid). Fail-soft to the bare select if the cost columns aren't live yet.
  const COST = 'material_cost_cents, dispatch_fee_cents, sub_cost_cents, sub_verified';
  const jobsQ = () => ctx.sb.from('jobs').not('tech_id', 'is', null).gte('completed_at', startISO).lt('completed_at', endISO).not('status', 'in', '(cancelled,canceled,hold)');
  let jr = await jobsQ().select(`id, tech_id, tech_name, amount, started_at, completed_at, ${COST}`);
  if (jr.error && /column|schema cache|does not exist/i.test(jr.error.message || '')) jr = await jobsQ().select('id, tech_id, tech_name, amount, started_at, completed_at');
  const jobs = jr.data || [];
  const byTech = {};
  (jobs || []).forEach((j) => {
    const m = (byTech[j.tech_id] = byTech[j.tech_id] || { name: j.tech_name || '', count: 0, rev: 0, hours: 0, jobs: [] });
    m.count++; m.rev += Number(j.amount) || 0; m.hours += onsiteHours(j.started_at, j.completed_at);
    m.jobs.push({ revenue_cents: Math.round((Number(j.amount) || 0) * 100), material_cost_cents: j.material_cost_cents, dispatch_fee_cents: j.dispatch_fee_cents, sub_cost_cents: j.sub_cost_cents, sub_verified: j.sub_verified });
    if (j.tech_name) m.name = j.tech_name;
  });

  const { data: pays } = await ctx.sb.from('pay_profiles').select('tech_id, pay_type, commission_pct, hourly_rate, weekly_salary, hire_date');
  const payByTech = {}; (pays || []).forEach((p) => { payByTech[p.tech_id] = p; });
  const { data: techs } = await ctx.sb.from('techs').select('id, name');
  const nameById = {}; (techs || []).forEach((t) => { nameById[t.id] = t.name; });

  // ── SPLIT COMMISSION (audit P2-8): a job worked by 2+ TECHS splits its commission EVENLY (50/50); a salary
  // tech on the crew gets $0 extra and their share is NOT redistributed (exactly the Tech Sheet "Split" rule).
  // Compute each JOB's commission ONCE and divide it among the commission crew → commByTech accumulates shares.
  // Falls back cleanly (no segments table / solo jobs) to the lead getting the whole job commission. ──
  const commByTech = {}, subPendByTech = {};
  const segByJob = {};
  try {
    const jobIds = [...new Set(jobs.map((j) => j.id).filter(Boolean))];
    for (let i = 0; i < jobIds.length; i += 300) {
      const { data: segs } = await ctx.sb.from('job_segments').select('parent_job_id, assigned_tech_id, kind, status').in('parent_job_id', jobIds.slice(i, i + 300)).neq('status', 'cancelled');
      (segs || []).forEach((s) => { if (s.assigned_tech_id && s.kind !== 'helper' && s.kind !== 'parts_run') (segByJob[s.parent_job_id] = segByJob[s.parent_job_id] || []).push(s.assigned_tech_id); });
    }
  } catch (_) { /* no segments table → every job is solo, lead gets full commission */ }
  const isComm = (tid) => ['commission', 'hourly_comm'].includes(payByTech[tid]?.pay_type || 'commission');
  for (const j of jobs) {
    const leadId = j.tech_id; if (!leadId) continue;
    const extraIds = [...new Set((segByJob[j.id] || []).filter((id) => id && String(id) !== String(leadId)))];
    const crew = [{ id: leadId, kind: 'lead', pay_type: payByTech[leadId]?.pay_type || 'commission' },
      ...extraIds.map((id) => ({ id, kind: 'second_tech', pay_type: payByTech[id]?.pay_type || 'commission' }))];
    const commCrew = crew.filter((c) => isComm(c.id));
    if (!commCrew.length) continue; // no commission techs on this job → no commission to split
    // The job commission is computed at the LEAD's rate (the job owner); if the lead isn't commission, use the
    // highest commission rate on the crew so a commission 2nd-tech still earns.
    const pct = isComm(leadId) ? (Number(payByTech[leadId]?.commission_pct) || 0) : Math.max(...commCrew.map((c) => Number(payByTech[c.id]?.commission_pct) || 0));
    const jobCost = { revenue_cents: Math.round((Number(j.amount) || 0) * 100), material_cost_cents: j.material_cost_cents, dispatch_fee_cents: j.dispatch_fee_cents, sub_cost_cents: j.sub_cost_cents, sub_verified: j.sub_verified };
    const r = computeJobPay(jobCost, pct);
    splitCommission(r.commission + r.premium, crew).forEach((sh) => { if (sh.id) { commByTech[sh.id] = (commByTech[sh.id] || 0) + sh.shareCents; if (r.subPending && !sh.isSalary) subPendByTech[sh.id] = true; } });
  }

  // ── Absences P3 context: holiday pay (techs) + salary docking/proration. Best-effort — every piece is
  // fail-soft so a missing table never blocks the run. Keyed tech_id ↔ user_id via profiles. ──
  const p3ctx = { userByTech: {}, unpaidByUser: {}, unexcusedByUser: {}, paidHolidaysInWeek: [], weekDates: [] };
  try {
    for (let i = 0; i < 7; i++) p3ctx.weekDates.push(addDays(ws, i));
    const year = Number(ws.slice(0, 4));
    p3ctx.paidHolidaysInWeek = holidaysForYear(year).filter((h) => h.paid && h.date >= ws && h.date <= weekEnd).map((h) => h.date);
    let pq = await ctx.sb.from('profiles').select('user_id, tech_id').not('tech_id', 'is', null);
    (pq.data || []).forEach((p) => { p3ctx.userByTech[p.tech_id] = p.user_id; });
    const yStart = `${year}-01-01`, yEnd = `${year}-12-31`;
    const off = await ctx.sb.from('time_off_requests').select('user_id, start_date, end_date, status, kind').eq('kind', 'unpaid').eq('status', 'approved').lte('start_date', weekEnd);
    (off.data || []).forEach((r) => { (p3ctx.unpaidByUser[r.user_id] = p3ctx.unpaidByUser[r.user_id] || []).push(r); });
    const abs = await ctx.sb.from('absences').select('user_id, absence_date, status').eq('status', 'unexcused').gte('absence_date', yStart).lte('absence_date', yEnd);
    (abs.data || []).forEach((a) => { (p3ctx.unexcusedByUser[a.user_id] = p3ctx.unexcusedByUser[a.user_id] || []).push(a.absence_date); });
  } catch (_) { /* P3 context unavailable → lines just carry 0 holiday/dock */ }
  const isWorkday = (dstr) => { const [y, m, d] = dstr.split('-').map(Number); const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return wd >= 1 && wd <= 5; };

  const techIds = [...new Set([...Object.keys(byTech), ...Object.keys(payByTech), ...Object.keys(commByTech)])];
  const { data: run, error: rErr } = await ctx.sb.from('cb_payroll_runs').insert({ week_start: ws, week_end: weekEnd, status: 'draft', created_by: ctx.profile.name || ctx.user.email }).select('id').single();
  if (rErr) return { ok: false, msg: rErr.message };

  const lines = techIds.map((tid) => {
    const j = byTech[tid] || { name: '', count: 0, rev: 0, hours: 0, jobs: [] };
    const p = payByTech[tid] || { pay_type: 'commission', commission_pct: 0, hourly_rate: 0, weekly_salary: 0 };
    // Commission on the CB NET base + premium — computed per-job above (with split-commission applied), the
    // SAME lib/pay.js engine the tech's /pay screen uses, so payroll and /pay can't disagree. commByTech already
    // holds this tech's total share (their solo jobs + their half of any split jobs).
    const comm = ['commission', 'hourly_comm'].includes(p.pay_type) ? (commByTech[tid] || 0) : 0;
    const subPending = !!subPendByTech[tid];
    const hours = Math.round((j.hours || 0) * 100) / 100;                  // auto on-site hours from job timeline
    const isSalary = p.pay_type === 'salary';
    const salaryBase = isSalary ? cents(p.weekly_salary) : 0;
    const hourlyCents = ['hourly', 'hourly_comm'].includes(p.pay_type) ? Math.round(hours * (Number(p.hourly_rate) || 0) * 100) : salaryBase;

    // P3: holiday pay (techs) + salary docking/proration. Suggested — the approver can edit on the draft.
    const uid = p3ctx.userByTech[tid];
    const unpaid = new Set();
    (p3ctx.unpaidByUser[uid] || []).forEach((r) => p3ctx.weekDates.forEach((d) => { if (isWorkday(d) && d >= r.start_date && d <= (r.end_date || r.start_date)) unpaid.add(d); }));
    (p3ctx.unexcusedByUser[uid] || []).forEach((d) => { if (p3ctx.weekDates.includes(d) && isWorkday(d)) unpaid.add(d); });
    let prorationDaysWorked = null;
    if (isSalary && p.hire_date && p.hire_date > ws && p.hire_date <= weekEnd) prorationDaysWorked = p3ctx.weekDates.filter((d) => isWorkday(d) && d >= p.hire_date).length;
    const p3 = computeP3({
      isSalary, weeklySalaryCents: salaryBase, hourlyRateDollars: Number(p.hourly_rate) || 0,
      unpaidDays: unpaid.size, holidayDates: isSalary ? [] : p3ctx.paidHolidaysInWeek,
      unexcusedDatesYTD: p3ctx.unexcusedByUser[uid] || [], prorationDaysWorked,
    });
    const dock_cents = p3.dockCents + Math.max(0, -p3.prorationCents); // proration shortfall docks like unpaid time

    return {
      run_id: run.id, tech_id: tid, tech_name: j.name || nameById[tid] || 'Tech', pay_type: p.pay_type,
      jobs_count: j.count, revenue_cents: Math.round(j.rev * 100), commission_cents: comm,
      hours, hourly_cents: hourlyCents, bonus_cents: 0, adjust_cents: 0,
      holiday_cents: p3.holidayCents, dock_cents,
      pto_note: [p3.notes.join(' · '), subPending ? '⚠ unverified sub cost' : ''].filter(Boolean).join(' · ') || null,
    };
  });
  if (lines.length) {
    let { error: lErr } = await ctx.sb.from('cb_payroll_lines').insert(lines);
    // Pre-160 (no holiday/dock/pto_note columns) → retry without them so the run still builds.
    if (lErr && /holiday_cents|dock_cents|pto_note|column|schema cache/i.test(lErr.message || '')) {
      const lite = lines.map(({ holiday_cents, dock_cents, pto_note, ...rest }) => rest);
      ({ error: lErr } = await ctx.sb.from('cb_payroll_lines').insert(lite));
    }
    if (lErr) return { ok: false, msg: lErr.message };
  }
  revalidatePath('/payroll');
  return { ok: true, runId: run.id, msg: `Draft built — ${lines.length} techs.` };
}

// Approver edits a line (hours→hourly, bonus, adjust, note). Only on a DRAFT run; hourly_cents is
// computed on the client from the tech's rate and passed in.
export async function saveLine(formData) {
  let ctx; try { ctx = await gate(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const lineId = clean(formData.get('lineId'), 80);
  if (!lineId) return { ok: false, msg: 'No line.' };
  const { data: line } = await ctx.sb.from('cb_payroll_lines').select('run_id, tech_id, tech_name').eq('id', lineId).maybeSingle();
  if (!line) return { ok: false, msg: 'Line not found.' };
  const { data: run } = await ctx.sb.from('cb_payroll_runs').select('status').eq('id', line.run_id).maybeSingle();
  if (run?.status === 'approved') return { ok: false, msg: 'Run is approved — reopen to edit.' };
  const selfEdit = !!ctx.profile.tech_id && String(line.tech_id) === String(ctx.profile.tech_id); // editing own pay

  const patch = {
    hours: Math.max(0, Number(formData.get('hours')) || 0),
    hourly_cents: cents(formData.get('hourly')),
    bonus_cents: cents(formData.get('bonus')),
    adjust_cents: Math.round((Number(formData.get('adjust')) || 0) * 100), // signed (can be negative)
    note: clean(formData.get('note'), 300) || null,
  };
  // P3 line items (holiday +, dock −) — approver-editable positive magnitudes. Pre-160 columns absent → retry.
  if (formData.get('holiday') != null) patch.holiday_cents = cents(formData.get('holiday'));
  if (formData.get('dock') != null) patch.dock_cents = cents(formData.get('dock'));
  let { error } = await ctx.sb.from('cb_payroll_lines').update(patch).eq('id', lineId);
  if (error && /holiday_cents|dock_cents|column|schema cache/i.test(error.message || '')) {
    const { holiday_cents, dock_cents, ...lite } = patch;
    ({ error } = await ctx.sb.from('cb_payroll_lines').update(lite).eq('id', lineId));
  }
  if (error) return { ok: false, msg: error.message };
  // AUDIT (audit P2-7): payroll had NO audit trail. Log every line edit; flag when someone edits their OWN pay
  // line (conflict of interest is now visible, not silent). Best-effort.
  try { await ctx.sb.from('audit_log').insert({ actor_id: ctx.user.id, actor_name: ctx.profile.name || ctx.user.email, role: ctx.profile.role, action: selfEdit ? 'payroll.self_line_edit' : 'payroll.line_edit', entity: 'cb_payroll_line', entity_id: lineId, detail: { run_id: line.run_id, tech: line.tech_name, self: selfEdit, bonus: patch.bonus_cents, adjust: patch.adjust_cents } }); } catch (_) {}
  revalidatePath('/payroll');
  return { ok: true, msg: selfEdit ? 'Saved — note: you edited your own pay line (logged).' : 'Saved.' };
}

// Approve the run (locks it). Never sends pay — export to the payroll file is a separate step.
export async function approveRun(runId) {
  let ctx; try { ctx = await gate(true); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const rid = clean(runId, 80);
  // Does this run include the approver's OWN pay line? Not blocked (a working owner is often the approver) but
  // recorded, so self-approval is auditable (audit P2-7).
  let selfIncluded = false;
  try { if (ctx.profile.tech_id) { const { data } = await ctx.sb.from('cb_payroll_lines').select('id').eq('run_id', rid).eq('tech_id', ctx.profile.tech_id).limit(1); selfIncluded = !!(data && data.length); } } catch (_) {}
  const { error } = await ctx.sb.from('cb_payroll_runs').update({ status: 'approved', approved_by: ctx.profile.name || ctx.user.email, approved_at: new Date().toISOString() }).eq('id', rid);
  if (error) return { ok: false, msg: error.message };
  try { await ctx.sb.from('audit_log').insert({ actor_id: ctx.user.id, actor_name: ctx.profile.name || ctx.user.email, role: ctx.profile.role, action: 'payroll.approved', entity: 'cb_payroll_run', entity_id: rid, detail: { self_included: selfIncluded } }); } catch (_) {}
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
