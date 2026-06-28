'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { postToDiscord } from '@/lib/discord';
import { marginPct } from '@/lib/pricebookEngine';

const missing = (e) => /relation|column|schema cache|does not exist/i.test(e?.message || '');
const num = (v) => Number(v) || 0;
const clean = (v, n = 400) => String(v == null ? '' : v).trim().slice(0, n);
const APPROVAL_METHODS = ['phone', 'in_person', 'text', 'email'];

async function ctx() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: 'Sign in required.' };
  const profile = await loadProfile(user);
  // Actionable perm only — never a read-only Viewer (seeAllJobs alone). Techs keep access via changeStatus.
  if (!(can(profile.role, 'changeStatus') || can(profile.role, 'collectPayment') || can(profile.role, 'createJobs')))
    return { err: 'Not allowed.' };
  return { user, profile, sb: getSupabaseAdmin() };
}

// Build a customer-safe snapshot of the cart and create a shareable estimate (token link). The snapshot
// holds ONLY customer-facing fields + customer-visible photos — no cost/margin/min ever reaches it.
// lines: [{ itemId, soldPrice, quantity }].
// opts: { headline, tierKey, bundleSlug, tiers }.
//   tiers (OPTIONAL) = the full Good/Better/Best ladder so the CUSTOMER sees the choice, not just the tech's
//   pre-pick. Each: { key, name, icon, pitch, bestFor, warranty, recommended, lines:[{itemId,soldPrice,quantity}] }.
//   When present, `lines`/`subtotal` (below) still hold the active/recommended tier for backward-compat + the
//   approval→usage path; the customer can switch tiers at the close, which re-points lines/subtotal server-side.
export async function createEstimate(jobId, lines = [], opts = {}) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  if (!Array.isArray(lines) || lines.length === 0) return { ok: false, msg: 'Add at least one item first.' };

  const { data: job } = await c.sb.from('jobs').select('id, job_number, customer_id, tech_id, customers(name)').eq('id', jobId).maybeSingle();
  if (!job) return { ok: false, msg: 'Job not found.' };

  // Gather every itemId referenced by the flat cart AND every tier so we fetch customer-safe data ONCE.
  // Custom lines (l.custom) carry no catalog itemId — they're ad-hoc, priced per-job by the tech, and pass
  // straight through to the snapshot (never a catalog lookup, never job_pricebook_usage, never a catalog price).
  const tierInput = Array.isArray(opts.tiers) ? opts.tiers : [];
  const allLineRefs = [...lines, ...tierInput.flatMap((t) => Array.isArray(t.lines) ? t.lines : [])];
  const itemIds = [...new Set(allLineRefs.map((l) => l.itemId).filter(Boolean))];
  const { data: items, error: ie } = await c.sb.from('pricebook_items').select('id, name, customer_name, customer_description, short_description, retail_price, warranty_text, primary_photo_url, pdf_url').in('id', itemIds);
  if (ie) return { ok: false, msg: missing(ie) ? 'Run supabase/104_pricebook.sql first.' : ie.message };
  const byId = {}; (items || []).forEach((i) => { byId[i.id] = i; });

  // Customer-visible gallery photos per item (pricebook_media). Best-effort.
  const mediaByItem = {};
  try {
    const { data: media } = await c.sb.from('pricebook_media').select('item_id, media_type, url, customer_visible, sort_order').in('item_id', itemIds).eq('customer_visible', true).order('sort_order');
    (media || []).forEach((m) => { (mediaByItem[m.item_id] = mediaByItem[m.item_id] || []).push(m); });
  } catch (_) {}

  // Resolve a list of {itemId, soldPrice, quantity} into customer-safe snapshot lines (no cost/margin/min).
  const snapOf = (ls) => (ls || []).map((l) => {
    // Ad-hoc custom line — the tech's per-job quote, no catalog item. Customer-safe by construction (only the
    // name/description/price the tech typed; no cost/margin/min exists for it). itemId stays null.
    if (l.custom) {
      const name = clean(l.name, 160); if (!name) return null;
      return { itemId: null, quantity: num(l.quantity) || 1, name, description: clean(l.description, 600), price: num(l.soldPrice), photo: null, gallery: [], warranty: '', pdf: null, custom: true };
    }
    const it = byId[l.itemId]; if (!it) return null;
    const gallery = (mediaByItem[l.itemId] || []).filter((m) => m.media_type === 'photo').map((m) => m.url);
    const pdf = it.pdf_url || (mediaByItem[l.itemId] || []).find((m) => m.media_type === 'pdf' || m.media_type === 'manufacturer_link')?.url || null;
    return {
      itemId: it.id,                 // hidden ref for approval → usage rows; never rendered to the customer
      quantity: num(l.quantity) || 1,
      name: it.customer_name || it.name,
      description: it.customer_description || it.short_description || '',
      price: num(l.soldPrice) || num(it.retail_price),
      photo: it.primary_photo_url || gallery[0] || null,
      gallery,
      warranty: it.warranty_text || '',
      pdf,
    };
  }).filter(Boolean);

  let snapLines = snapOf(lines);
  if (!snapLines.length) return { ok: false, msg: 'No sellable items in the cart.' };

  // Build the customer-safe ladder. Only customer fields survive — icon/pitch/bestFor/warranty/recommended
  // are presentation copy (no prices moved here). Drop any tier that resolves to nothing.
  const TIER_ICON = { good: '🥉', better: '🥈', best: '🥇' };
  const tierSnaps = tierInput.map((t) => {
    const tLines = snapOf(t.lines);
    if (!tLines.length) return null;
    return {
      key: clean(t.key, 16) || 'tier',
      name: clean(t.name, 60) || (t.key ? String(t.key) : 'Option'),
      icon: t.icon || TIER_ICON[t.key] || '🔧',
      pitch: clean(t.pitch, 240),
      bestFor: clean(t.bestFor, 160),
      warranty: clean(t.warranty, 160),
      includes: tLines.map((l) => l.name),
      lines: tLines,
      subtotal: tLines.reduce((s, l) => s + l.price, 0),
      recommended: !!t.recommended,
    };
  }).filter(Boolean);
  // Guarantee exactly one recommended (the middle if the tech didn't flag one).
  if (tierSnaps.length && !tierSnaps.some((t) => t.recommended)) tierSnaps[Math.min(1, tierSnaps.length - 1)].recommended = true;
  // When a ladder exists, the flat snapshot (the approval source + the fallback view) defaults to the
  // RECOMMENDED tier — so it's coherent no matter what the cart held when Send was tapped. The customer can
  // still switch tiers at the close, which re-points lines/subtotal.
  if (tierSnaps.length) { const rec = tierSnaps.find((t) => t.recommended) || tierSnaps[0]; snapLines = rec.lines; }

  const subtotal = snapLines.reduce((s, l) => s + l.price, 0);
  const cardFee = Math.round(subtotal * 0.04 * 100) / 100;
  const token = randomUUID().replace(/-/g, '').slice(0, 24);

  // Bundle-level customer copy if a tier was chosen.
  let headline = opts.headline || '', customerDescription = '', warrantyText = '', approveText = 'Approve & Schedule';
  if (opts.bundleSlug) {
    try { const { data: b } = await c.sb.from('pricebook_bundles').select('customer_description, warranty_text, approval_button_text').eq('slug', opts.bundleSlug).maybeSingle(); if (b) { customerDescription = b.customer_description || ''; warrantyText = b.warranty_text || ''; approveText = b.approval_button_text || approveText; } } catch (_) {}
  }

  const row = {
    token, job_id: jobId, job_number: job.job_number || null, customer_id: job.customer_id || null,
    customer_name: (job.customers && job.customers.name) || null, tech_id: job.tech_id || null, tech_name: c.profile.name || c.user.email,
    bundle_slug: opts.bundleSlug || null, tier_key: opts.tierKey || null, headline,
    customer_description: customerDescription, warranty_text: warrantyText, approve_text: approveText,
    lines: snapLines, tiers: tierSnaps, subtotal, card_fee: cardFee, status: 'sent', created_by: c.user.id,
  };
  let { error } = await c.sb.from('pricebook_estimates').insert(row);
  // Backward-compat: if the `tiers` column isn't migrated yet, fall back to the flat single-tier insert so
  // sending an estimate never hard-fails on an un-run migration.
  if (error && /tiers/.test(error.message || '') && missing(error)) {
    const { tiers: _drop, ...flat } = row;
    ({ error } = await c.sb.from('pricebook_estimates').insert(flat));
  }
  if (error) return { ok: false, msg: missing(error) ? 'Run supabase/106_pricebook_estimates.sql first.' : error.message };

  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: row.tech_name, role: c.profile.role, action: 'estimate.create', entity: 'pricebook_estimate', entity_id: token, detail: { lines: snapLines.length, subtotal } }); } catch (_) {}
  try { await c.sb.from('pricebook_estimate_events').insert({ token, event_type: 'sent', method: 'link', actor: row.tech_name, actor_role: 'tech', amount: subtotal }); } catch (_) {}
  return { ok: true, token, url: `/e/${token}`, msg: 'Estimate ready to present or send.' };
}

// 📞 Log a phone / verbal / text approval that happened OFF the link — the out-of-state landlord who
// says "yes" on the phone. The tech is the witness on record. Same proof table, same conversion to usage
// rows, so it counts identically to a tapped approval — and can't later be disputed.
export async function logManualApproval(token, opts = {}) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const tk = clean(token, 64);
  const name = clean(opts.name, 120);
  const method = APPROVAL_METHODS.includes(opts.method) ? opts.method : 'phone';
  const note = clean(opts.note, 400);
  if (!tk) return { ok: false, msg: 'No estimate.' };
  if (!name) return { ok: false, msg: 'Who approved it? Enter their name.' };

  const { data: est } = await c.sb.from('pricebook_estimates').select('*').eq('token', tk).maybeSingle();
  if (!est) return { ok: false, msg: 'Estimate not found.' };
  if (est.status === 'approved') return { ok: true, msg: 'Already approved.' };

  const total = num(est.subtotal);
  const methodLabel = { phone: 'over the phone', in_person: 'in person', text: 'by text', email: 'by email' }[method];
  const consentText = `Verbal/${method} approval of $${total.toLocaleString()} from ${name} ${methodLabel}, logged by ${c.profile.name || c.user.email}.${note ? ' Note: ' + note : ''}`;

  // Convert to usage rows (mirrors the customer-link approval).
  const lines = Array.isArray(est.lines) ? est.lines : [];
  const itemIds = lines.map((l) => l.itemId).filter(Boolean);
  const costById = {};
  if (itemIds.length) { try { const { data: items } = await c.sb.from('pricebook_items').select('id, estimated_material_cost, estimated_labor_hours').in('id', itemIds); (items || []).forEach((i) => { costById[i.id] = i; }); } catch (_) {} }
  const nowISO = new Date().toISOString();
  const usage = lines.filter((l) => l.itemId).map((l) => {
    const it = costById[l.itemId] || {}; const cost = num(it.estimated_material_cost); const price = num(l.price);
    return { job_id: est.job_id, job_number: est.job_number, customer_id: est.customer_id, tech_id: est.tech_id, item_id: l.itemId, quantity: num(l.quantity) || 1, sold_price: price, actual_cost: cost, estimated_labor_hours: num(it.estimated_labor_hours), margin_pct: marginPct({ retail_price: price, estimated_material_cost: cost }), source: 'manual_approval', sold_at: nowISO };
  });
  if (usage.length) { try { await c.sb.from('job_pricebook_usage').insert(usage); } catch (_) {} }

  try {
    await c.sb.from('pricebook_estimates').update({ status: 'approved', responded_at: nowISO, approved_name: name, approval_method: method, consent_text: consentText, witnessed_by_tech_id: c.user.id, witnessed_by_name: c.profile.name || c.user.email }).eq('id', est.id);
  } catch (e) { return { ok: false, msg: missing(e) ? 'Run supabase/117_estimate_proof.sql first.' : e.message }; }
  try { await c.sb.from('pricebook_estimate_events').insert({ estimate_id: est.id, token: tk, event_type: 'phone_approval', method, actor: name, actor_role: 'customer', note: consentText, amount: total }); } catch (_) {}
  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: c.profile.name || c.user.email, role: c.profile.role, action: 'estimate.manual_approval', entity: 'pricebook_estimate', entity_id: tk, detail: { name, method, total } }); } catch (_) {}
  try { await postToDiscord(`✅ **Approval logged (${methodLabel})** — ${name}${est.job_number ? ` · job ${est.job_number}` : ''} approved $${total.toLocaleString()}, witnessed by ${c.profile.name || ''}.`); } catch (_) {}
  revalidatePath(`/job/${est.job_id}/pricebook`);
  return { ok: true, msg: `Logged — ${name}'s ${methodLabel} approval is on record.` };
}

// Estimates for this job + their proof timeline (for the tech/office to see status + who approved + how).
export async function listJobEstimates(jobId) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err, estimates: [] };
  if (!jobId) return { ok: false, msg: 'No job.', estimates: [] };
  try {
    const { data: rows } = await c.sb.from('pricebook_estimates').select('token, headline, subtotal, status, approved_name, approval_method, witnessed_by_name, consent_text, responded_at, viewed_at, created_at').eq('job_id', jobId).order('created_at', { ascending: false }).limit(20);
    const estimates = rows || [];
    const tokens = estimates.map((e) => e.token);
    const eventsByToken = {};
    if (tokens.length) {
      try { const { data: evs } = await c.sb.from('pricebook_estimate_events').select('token, event_type, method, actor, note, amount, created_at').in('token', tokens).order('created_at', { ascending: true }).limit(300); (evs || []).forEach((ev) => { (eventsByToken[ev.token] = eventsByToken[ev.token] || []).push(ev); }); } catch (_) {}
    }
    return { ok: true, estimates: estimates.map((e) => ({ ...e, events: eventsByToken[e.token] || [] })) };
  } catch (e) { return { ok: false, msg: missing(e) ? 'Run supabase/117_estimate_proof.sql first.' : e.message, estimates: [] }; }
}
