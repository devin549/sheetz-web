'use server';

// Receipt ↔ work-order reconciliation (the web hub). Matches each job's booked material cost to the receipts
// on file; a missing or mismatched receipt becomes a flag against the tech — 1st = warning (tech notified),
// 2nd+ = Doc Fraud Fee + work flagged for review. We FLAG and QUEUE; we never auto-deduct pay (accounting
// confirms the fee), consistent with the no-auto-pay rule. Idempotent: one flag per (job, kind).
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { reconcileReceipts, flagLevel } from '@/lib/receiptReconcile';
import { revalidatePath } from 'next/cache';

async function gate() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await loadProfile(user) : null;
  if (!user || !profile || !can(profile.role, 'seeFinancials')) return null;
  return { user, profile, sb: getSupabaseAdmin() };
}
const NEEDS_MIG = (e) => /receipt_flags|column|schema cache|does not exist/i.test(e?.message || '');

export async function runReceiptReconciliation(days = 30) {
  const g = await gate();
  if (!g) return { ok: false, msg: 'Only accounting / owner can run reconciliation.' };
  if (!g.sb) return { ok: false, msg: 'Server not configured.' };
  const sinceISO = new Date(Date.now() - Math.max(1, Number(days) || 30) * 86400000).toISOString();

  // Jobs in-window with a booked material cost.
  let jobs = [];
  try {
    const { data } = await g.sb.from('jobs').select('id, job_number, tech_id, tech_name, material_cost_cents, created_at')
      .gt('material_cost_cents', 0).gte('created_at', sinceISO).order('created_at', { ascending: false }).limit(500);
    jobs = data || [];
  } catch (e) { return { ok: false, msg: /material_cost/.test(e?.message || '') ? 'Run supabase/73_pay_structure.sql first.' : 'Could not load jobs.' }; }
  if (!jobs.length) return { ok: true, msg: 'No jobs with material cost in range — nothing to reconcile.', found: 0, created: 0 };

  // Receipts on file per job (verified or pending count as "on file"; flagged ones don't).
  const receiptsByJob = {};
  try {
    const { data: rs } = await g.sb.from('receipt_entries').select('job_id, amount_cents, status').in('job_id', jobs.map((j) => j.id));
    (rs || []).forEach((r) => { if (r.status === 'flagged') return; (receiptsByJob[r.job_id] ||= []).push({ amount_cents: r.amount_cents }); });
  } catch (_) { /* no entries table yet → everything reads as missing; still safe */ }

  const discrepancies = reconcileReceipts(jobs, receiptsByJob);
  if (!discrepancies.length) return { ok: true, msg: 'All receipts match their work orders. 🎉', found: 0, created: 0 };

  // Skip discrepancies already flagged (idempotent), and seed the per-tech prior-flag counts.
  let existing = [], techCounts = {};
  try {
    const { data: ex, error } = await g.sb.from('receipt_flags').select('job_id, kind, tech_id, status');
    if (error) return { ok: false, msg: NEEDS_MIG(error) ? 'Run supabase/138_receipt_flags.sql first.' : error.message };
    existing = ex || [];
  } catch (e) { return { ok: false, msg: NEEDS_MIG(e) ? 'Run supabase/138_receipt_flags.sql first.' : 'Could not load flags.' }; }
  const flagged = new Set(existing.map((f) => `${f.job_id}|${f.kind}`));
  existing.filter((f) => f.status === 'open' && f.tech_id).forEach((f) => { techCounts[f.tech_id] = (techCounts[f.tech_id] || 0) + 1; });

  let warnings = 0, fees = 0;
  for (const d of discrepancies) {
    if (flagged.has(`${d.job_id}|${d.kind}`)) continue;            // already flagged
    const prior = d.tech_id ? (techCounts[d.tech_id] || 0) : 0;
    const level = flagLevel(prior);
    const { error } = await g.sb.from('receipt_flags').insert({
      job_id: d.job_id, job_number: d.job_number, tech_id: d.tech_id, tech_name: d.tech_name,
      kind: d.kind, level, detail: d.detail, status: 'open',
    });
    if (error) { if (NEEDS_MIG(error)) return { ok: false, msg: 'Run supabase/138_receipt_flags.sql first.' }; continue; }
    if (d.tech_id) techCounts[d.tech_id] = prior + 1;
    if (level === 'fee') fees++; else warnings++;
    // One warning: tell the tech on the first; a fee is a heavier flag accounting confirms.
    try { await g.sb.from('cb_comms').insert({ channel: 'system', direction: 'out', to_addr: d.tech_name || 'tech', from_name: 'Accounting', body: level === 'warning' ? `⚠️ Receipt warning on job ${d.job_number || ''}: ${d.kind === 'receipt_missing' ? 'no receipt on file for the materials charged' : 'the receipt doesn’t match the job cost'}. First one’s a warning — please fix it. Next time it’s a Doc Fraud Fee.` : `🛑 Doc Fraud Fee flagged on job ${d.job_number || ''} (${d.kind}). Your work is flagged for review.`, status: 'sent' }); } catch (_) {}
  }
  try { await g.sb.from('audit_log').insert({ actor_id: g.user.id, actor_name: g.profile.name || g.user.email, role: g.profile.role, action: 'receipts.reconciled', entity: 'receipts', entity_id: 'batch', detail: { found: discrepancies.length, warnings, fees, days } }); } catch (_) {}
  revalidatePath('/receipts');
  return { ok: true, msg: `${warnings + fees} new flag(s): ${warnings} warning(s), ${fees} fee(s).`, found: discrepancies.length, created: warnings + fees, warnings, fees };
}

// Accounting resolves a flag: fixed (resolved) or waived (no fee). Audited.
export async function resolveReceiptFlag(id, decision) {
  const g = await gate();
  if (!g) return { ok: false, msg: 'Only accounting / owner can resolve flags.' };
  if (!g.sb) return { ok: false, msg: 'Server not configured.' };
  if (!['resolved', 'waived'].includes(decision)) return { ok: false, msg: 'Bad decision.' };
  const { error } = await g.sb.from('receipt_flags').update({ status: decision, resolved_by: g.profile.name || g.user.email, resolved_at: new Date().toISOString() }).eq('id', id);
  if (error) return { ok: false, msg: error.message };
  try { await g.sb.from('audit_log').insert({ actor_id: g.user.id, actor_name: g.profile.name || g.user.email, role: g.profile.role, action: decision === 'waived' ? 'receipt_flag.waived' : 'receipt_flag.resolved', entity: 'receipt_flag', entity_id: String(id) }); } catch (_) {}
  revalidatePath('/receipts');
  return { ok: true, msg: decision === 'waived' ? 'Waived — no fee.' : 'Marked resolved.' };
}
