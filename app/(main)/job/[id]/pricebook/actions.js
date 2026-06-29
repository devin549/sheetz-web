'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { canOverrideMinimum, marginPct } from '@/lib/pricebookEngine';
import { scopeJob } from './scope';

const missing = (e) => /relation|column|schema cache|does not exist/i.test(e?.message || '');
const clean = (v, n = 300) => String(v == null ? '' : v).trim().slice(0, n);

async function ctx() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!(can(profile.role, 'changeStatus') || can(profile.role, 'seeOwnOnly') || can(profile.role, 'collectPayment') || can(profile.role, 'seeAllJobs')))
    return { err: 'Not allowed.' };
  return { user, profile, sb: getSupabaseAdmin() };
}

// Record a sale: each cart line → a job_pricebook_usage row tied to job/customer/tech (+ project/unit).
// Minimum-price guard: if any line is below the item's minimum and the seller isn't a manager, block and
// ask for approval (never silently discount). lines: [{ itemId, quantity, soldPrice, discountReason }].
export async function recordSale(jobId, lines = [], opts = {}) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const s = await scopeJob(c, jobId); if (s.err) return { ok: false, msg: s.err };
  if (!Array.isArray(lines) || lines.length === 0) return { ok: false, msg: 'Add at least one item.' };

  // Pull the job context + the item rows (for cost/min/labor on each line).
  const { data: job } = await c.sb.from('jobs').select('id, job_number, customer_id, tech_id, project_id').eq('id', jobId).maybeSingle();
  if (!job) return { ok: false, msg: 'Job not found.' };
  const itemIds = [...new Set(lines.map((l) => l.itemId).filter(Boolean))];
  const { data: itemRows, error: ie } = await c.sb.from('pricebook_items').select('id, sku, name, retail_price, minimum_price, estimated_material_cost, estimated_labor_hours').in('id', itemIds);
  if (ie) return { ok: false, msg: missing(ie) ? 'Run supabase/104_pricebook.sql first.' : ie.message };
  const byId = {}; (itemRows || []).forEach((i) => { byId[i.id] = i; });

  // Minimum-price guard.
  const belowMin = [];
  for (const l of lines) {
    const it = byId[l.itemId]; if (!it) continue;
    const min = it.minimum_price == null ? null : Number(it.minimum_price);
    if (min != null && Number(l.soldPrice) < min) belowMin.push({ name: it.name, min, sold: Number(l.soldPrice) });
  }
  if (belowMin.length && !canOverrideMinimum(c.profile.role)) {
    return { ok: false, needsApproval: true, msg: `Below minimum on ${belowMin.map((b) => b.name).join(', ')} — needs manager approval to send.`, belowMin };
  }

  const nowISO = new Date().toISOString();
  const rows = lines.map((l) => {
    const it = byId[l.itemId] || {};
    const qty = Number(l.quantity) || 1;
    const sold = Number(l.soldPrice) || 0;
    const cost = Number(it.estimated_material_cost) || 0;
    return {
      job_id: jobId, job_number: job.job_number || null, customer_id: job.customer_id || null, tech_id: job.tech_id || null,
      project_id: job.project_id || null, project_number: clean(opts.projectNumber, 60) || null, unit_label: clean(opts.unitLabel, 60) || null,
      item_id: l.itemId, quantity: qty, sold_price: sold, actual_cost: cost,
      estimated_labor_hours: Number(it.estimated_labor_hours) || 0,
      margin_pct: marginPct({ retail_price: sold, estimated_material_cost: cost }),
      source: 'estimate', sold_at: nowISO,
    };
  }).filter((r) => r.item_id);

  // Custom (not-in-book) lines have no catalog item_id, so they can't become usage rows here. They're only
  // captured properly via Present/Send (the estimate snapshot). NEVER silently drop them into a "$0 sold"
  // success — if the cart is custom-only, block with a clear message; if mixed, record the catalog lines and
  // tell the tech the custom ones still need to be sent.
  const customCount = lines.filter((l) => !l.itemId).length;
  if (rows.length === 0) {
    return { ok: false, msg: customCount > 0 ? 'Custom / not-in-the-book lines can’t be recorded directly — tap “Present / send to customer” so they’re captured on the estimate.' : 'Nothing to record.' };
  }

  const { error } = await c.sb.from('job_pricebook_usage').insert(rows);
  if (error) return { ok: false, msg: missing(error) ? 'Run supabase/104_pricebook.sql first.' : error.message };

  const total = rows.reduce((s, r) => s + r.sold_price * r.quantity, 0);
  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: c.profile.name || c.user.email, role: c.profile.role, action: 'pricebook.sold', entity: 'job', entity_id: String(jobId), detail: { lines: rows.length, total, belowMinApproved: belowMin.length, customSkipped: customCount } }); } catch (_) {}
  revalidatePath(`/job/${jobId}/pricebook`);
  const customNote = customCount > 0 ? ` (${customCount} custom line${customCount > 1 ? 's' : ''} not recorded — send those as an estimate)` : '';
  return { ok: true, msg: `Sold ${rows.length} item${rows.length > 1 ? 's' : ''} · ${'$' + total.toLocaleString()} on job ${job.job_number || ''}.${customNote}`, total };
}
