'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { revalidatePath } from 'next/cache';
import { nyTodayStr } from '@/lib/day';

const PAYROLL_ROLES = ['owner', 'admin', 'gm', 'om', 'accounting'];
const APPROVE_ROLES = ['owner', 'admin', 'gm', 'om'];

async function gate(approve = false) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  const allowed = (approve ? APPROVE_ROLES : PAYROLL_ROLES).includes(String(profile.role).toLowerCase());
  if (!user || !allowed) throw new Error(approve ? 'Only an approver (owner/GM/OM) can apply a fee to pay.' : 'Your role can’t manage doc-fraud cases.');
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Server not configured.');
  return { sb, user, profile };
}
const clean = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const cents = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0; };
const addDays = (d, n) => { const [y, m, day] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10); };
const sundayOf = (d) => { const [y, m, day] = d.split('-').map(Number); const dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay(); return addDays(d, -dow); };

export async function createCase(formData) {
  let ctx; try { ctx = await gate(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const techId = clean(formData.get('techId'), 80) || null;
  const fee = cents(formData.get('fee'));
  if (!techId) return { ok: false, msg: 'Pick the tech.' };
  if (!fee) return { ok: false, msg: 'Enter a fee.' };
  const { error } = await ctx.sb.from('doc_fraud_cases').insert({
    tech_id: techId, tech_name: clean(formData.get('techName'), 120) || null,
    job_id: clean(formData.get('jobId'), 80) || null, photo_id: clean(formData.get('photoId'), 80) || null,
    claimed_cents: cents(formData.get('claimed')), fee_cents: fee, reason: clean(formData.get('reason'), 300) || null,
    created_by: ctx.profile.name || ctx.user.email,
  });
  if (error) { if (/could not find|does not exist|schema cache/i.test(error.message || '')) return { ok: false, msg: 'Run supabase/32_doc_fraud.sql first.' }; return { ok: false, msg: error.message }; }
  revalidatePath('/doc-fraud');
  return { ok: true, msg: 'Case opened.' };
}

export async function absolveCase(id) {
  let ctx; try { ctx = await gate(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const { error } = await ctx.sb.from('doc_fraud_cases').update({ status: 'absolved', resolved_by: ctx.profile.name || ctx.user.email, resolved_at: new Date().toISOString() }).eq('id', clean(id, 80)).eq('status', 'open');
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/doc-fraud');
  return { ok: true, msg: 'Absolved — no fee.' };
}

// Apply the fee as a NEGATIVE adjust on THIS week's DRAFT payroll line for the tech (reviewed before
// the run is approved). If there's no draft this week, just marks it applied for manual entry.
export async function applyToPayroll(id) {
  let ctx; try { ctx = await gate(true); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const cid = clean(id, 80);
  const { data: c } = await ctx.sb.from('doc_fraud_cases').select('id, tech_id, fee_cents, status').eq('id', cid).maybeSingle();
  if (!c) return { ok: false, msg: 'Case not found.' };
  if (c.status !== 'open') return { ok: false, msg: 'Already resolved.' };

  const week = sundayOf(nyTodayStr());
  let runId = null, applied = false;
  const { data: run } = await ctx.sb.from('cb_payroll_runs').select('id, status').eq('week_start', week).maybeSingle();
  if (run && run.status === 'draft' && c.tech_id) {
    const { data: line } = await ctx.sb.from('cb_payroll_lines').select('id, adjust_cents').eq('run_id', run.id).eq('tech_id', c.tech_id).maybeSingle();
    if (line) { await ctx.sb.from('cb_payroll_lines').update({ adjust_cents: (line.adjust_cents || 0) - (c.fee_cents || 0) }).eq('id', line.id); runId = run.id; applied = true; }
  }
  await ctx.sb.from('doc_fraud_cases').update({ status: 'applied', resolved_by: ctx.profile.name || ctx.user.email, resolved_at: new Date().toISOString(), payroll_run_id: runId }).eq('id', cid);
  try { await ctx.sb.from('audit_log').insert({ actor_id: ctx.user.id, actor_name: ctx.profile.name || ctx.user.email, role: ctx.profile.role, action: 'docfraud.apply', entity: 'doc_fraud_case', entity_id: cid, detail: { fee_cents: c.fee_cents, payroll_run_id: runId } }); } catch (_) {}
  revalidatePath('/doc-fraud');
  revalidatePath('/payroll');
  return { ok: true, msg: applied ? 'Fee applied to this week’s draft payroll — review before approving.' : 'Marked applied — no draft payroll this week; enter the fee on payroll manually.' };
}
