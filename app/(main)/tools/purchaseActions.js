'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { canAny } from '@/lib/roles';
import { dollarsToCents, weeklyCents, remainingCents, nextDeductionCents, separationRefundCents, centsToStr } from '@/lib/toolPurchase';

const clean = (v, n = 300) => String(v == null ? '' : v).trim().slice(0, n);
const missing = (e) => /relation|column|schema cache|does not exist/i.test(e?.message || '');
const isMgr = (r) => canAny(r, ['manageInventory', 'assignJobs', 'manageUsers', 'seeCrew']);
const weekMonday = () => { const d = new Date(); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return d.toISOString().slice(0, 10); };

async function ctx() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: 'Sign in required.' };
  return { user, profile: await loadProfile(user), sb: getSupabaseAdmin() };
}

// Start a payoff plan: company bought a tool, it's company property assigned to the tech, and a weekly
// deduction (a % of value) chips it down. opts: { toolId, toolName, techName, valueDollars, weeklyPct, vendor, receiptPath }.
export async function createToolPurchase(opts = {}) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  if (!isMgr(c.profile.role)) return { ok: false, msg: 'A manager sets up tool plans.' };
  const techName = clean(opts.techName, 120);
  const purchase = dollarsToCents(opts.valueDollars);
  if (!techName) return { ok: false, msg: 'Who is the tool for?' };
  if (purchase <= 0) return { ok: false, msg: 'Enter the tool value.' };
  let pct = Number(opts.weeklyPct); if (!(pct > 0)) pct = 10; pct = Math.min(100, pct);

  let toolId = clean(opts.toolId, 80) || null;
  let toolName = clean(opts.toolName, 160);
  // If no tool row was given, create one so it lands in the registry as company property on the tech.
  if (!toolId) {
    try {
      const { data } = await c.sb.from('tools').insert({ name: toolName || 'New tool', assigned_to: techName, status: 'assigned', company_owned: true, value: purchase / 100 }).select('id').maybeSingle();
      toolId = data?.id || null;
    } catch (_) {}
  }

  const row = {
    tool_id: toolId, tool_name: toolName || 'Tool', tech_name: techName, purchase_cents: purchase,
    weekly_pct: pct, weekly_cents: weeklyCents(purchase, pct), vendor: clean(opts.vendor, 120) || null,
    receipt_path: clean(opts.receiptPath, 400) || null, created_by: c.user.id, created_by_name: c.profile.name || c.user.email,
  };
  const { data: purch, error } = await c.sb.from('tool_purchases').insert(row).select('id').maybeSingle();
  if (error) return { ok: false, msg: missing(error) ? 'Run supabase/98_tool_purchases.sql first.' : error.message };

  if (toolId) { try { await c.sb.from('tools').update({ company_owned: true, purchase_id: purch?.id, assigned_to: techName, status: 'assigned' }).eq('id', toolId); } catch (_) {} }
  try { await c.sb.from('tool_events').insert({ tool_id: toolId, tool_name: row.tool_name, event: 'issued', holder_name: techName, by_name: row.created_by_name, by_id: c.user.id, cost_cents: purchase, condition_photo: row.receipt_path, note: `Purchase plan · ${centsToStr(row.weekly_cents)}/wk` }); } catch (_) {}
  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: row.created_by_name, role: c.profile.role, action: 'tool.purchase.create', entity: 'tool_purchase', entity_id: String(purch?.id), detail: { techName, purchase, pct } }); } catch (_) {}
  revalidatePath('/tools'); revalidatePath('/pay');
  return { ok: true, msg: `Plan set · ${centsToStr(row.weekly_cents)}/wk for ${techName}.` };
}

// Post one week's deduction toward a plan (defaults to the weekly rate, capped at the balance). Once fully
// paid, the tool transfers to the tech. One deduction per plan per week is enforced in the DB.
export async function postDeduction(purchaseId, opts = {}) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  if (!isMgr(c.profile.role)) return { ok: false, msg: 'A manager posts deductions.' };
  const { data: p } = await c.sb.from('tool_purchases').select('*').eq('id', purchaseId).maybeSingle();
  if (!p) return { ok: false, msg: 'Plan not found.' };
  if (p.status !== 'active') return { ok: false, msg: 'Plan is already closed.' };
  const amount = opts.amountDollars != null ? Math.min(dollarsToCents(opts.amountDollars), remainingCents(p)) : nextDeductionCents(p);
  if (amount <= 0) return { ok: false, msg: 'Nothing left to deduct.' };
  const week = clean(opts.weekOf, 12) || weekMonday();

  const { error } = await c.sb.from('tool_payments').insert({ purchase_id: purchaseId, tech_name: p.tech_name, amount_cents: amount, kind: 'deduction', week_of: week, note: clean(opts.note, 300) || null, created_by: c.user.id, created_by_name: c.profile.name || c.user.email });
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return { ok: false, msg: 'This week is already posted for that plan.' };
    return { ok: false, msg: missing(error) ? 'Run supabase/98_tool_purchases.sql first.' : error.message };
  }
  const paid = (Number(p.paid_cents) || 0) + amount;
  const done = paid >= Number(p.purchase_cents);
  await c.sb.from('tool_purchases').update({ paid_cents: paid, status: done ? 'paid_off' : 'active', closed_on: done ? new Date().toISOString() : null }).eq('id', purchaseId);
  if (done && p.tool_id) { try { await c.sb.from('tools').update({ company_owned: false, purchase_id: null }).eq('id', p.tool_id); } catch (_) {} }
  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: c.profile.name || c.user.email, role: c.profile.role, action: 'tool.purchase.deduct', entity: 'tool_purchase', entity_id: String(purchaseId), detail: { amount, week, paid, done } }); } catch (_) {}
  revalidatePath('/tools'); revalidatePath('/pay');
  return { ok: true, msg: done ? `Paid off! ${p.tool_name} is now ${p.tech_name}'s.` : `Deducted ${centsToStr(amount)} · ${centsToStr(remainingCents({ ...p, paid_cents: paid }))} left.` };
}

// Post this week's deduction for EVERY active plan that hasn't been posted yet (payroll run).
export async function postWeeklyForAll() {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  if (!isMgr(c.profile.role)) return { ok: false, msg: 'A manager runs payroll deductions.' };
  const { data: plans, error } = await c.sb.from('tool_purchases').select('*').eq('status', 'active');
  if (error) return { ok: false, msg: missing(error) ? 'Run supabase/98_tool_purchases.sql first.' : error.message };
  const week = weekMonday(); let posted = 0, total = 0;
  for (const p of plans || []) {
    const amount = nextDeductionCents(p); if (amount <= 0) continue;
    const { error: e } = await c.sb.from('tool_payments').insert({ purchase_id: p.id, tech_name: p.tech_name, amount_cents: amount, kind: 'deduction', week_of: week, created_by: c.user.id, created_by_name: c.profile.name || c.user.email });
    if (e) continue; // duplicate week → already posted, skip
    const paid = (Number(p.paid_cents) || 0) + amount; const done = paid >= Number(p.purchase_cents);
    await c.sb.from('tool_purchases').update({ paid_cents: paid, status: done ? 'paid_off' : 'active', closed_on: done ? new Date().toISOString() : null }).eq('id', p.id);
    if (done && p.tool_id) { try { await c.sb.from('tools').update({ company_owned: false, purchase_id: null }).eq('id', p.tool_id); } catch (_) {} }
    posted++; total += amount;
  }
  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: c.profile.name || c.user.email, role: c.profile.role, action: 'tool.purchase.weekly_run', entity: 'tool_purchase', entity_id: week, detail: { posted, total } }); } catch (_) {}
  revalidatePath('/tools'); revalidatePath('/pay');
  return { ok: true, msg: posted ? `Posted ${posted} deduction${posted > 1 ? 's' : ''} · ${centsToStr(total)} this week.` : 'All active plans are already posted this week.' };
}

// Fired / quit before payoff: refund everything they've paid, company KEEPS the tool (back to shop stock).
export async function closeOnSeparation(purchaseId, reason = 'separated') {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  if (!isMgr(c.profile.role)) return { ok: false, msg: 'A manager closes plans.' };
  const { data: p } = await c.sb.from('tool_purchases').select('*').eq('id', purchaseId).maybeSingle();
  if (!p) return { ok: false, msg: 'Plan not found.' };
  if (p.status !== 'active') return { ok: false, msg: 'Plan is already closed.' };
  const refund = separationRefundCents(p);
  if (refund > 0) { try { await c.sb.from('tool_payments').insert({ purchase_id: purchaseId, tech_name: p.tech_name, amount_cents: refund, kind: 'refund', week_of: weekMonday(), note: `Separation refund · ${clean(reason, 60)}`, created_by: c.user.id, created_by_name: c.profile.name || c.user.email }); } catch (_) {} }
  await c.sb.from('tool_purchases').update({ status: 'closed', closed_on: new Date().toISOString(), closed_reason: clean(reason, 120) || 'separated' }).eq('id', purchaseId);
  // Company keeps the tool — revert it to shop stock, drop the plan link.
  if (p.tool_id) { try { await c.sb.from('tools').update({ company_owned: true, purchase_id: null, assigned_to: null, status: 'on_van' }).eq('id', p.tool_id); } catch (_) {}
    try { await c.sb.from('tool_events').insert({ tool_id: p.tool_id, tool_name: p.tool_name, event: 'returned', holder_name: p.tech_name, by_name: c.profile.name || c.user.email, by_id: c.user.id, note: `Plan closed (${clean(reason, 40)}) · refunded ${centsToStr(refund)}, company kept tool` }); } catch (_) {} }
  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: c.profile.name || c.user.email, role: c.profile.role, action: 'tool.purchase.separate', entity: 'tool_purchase', entity_id: String(purchaseId), detail: { refund, reason } }); } catch (_) {}
  revalidatePath('/tools'); revalidatePath('/pay');
  return { ok: true, msg: `Refunded ${centsToStr(refund)} to ${p.tech_name}; company keeps ${p.tool_name}.` };
}
