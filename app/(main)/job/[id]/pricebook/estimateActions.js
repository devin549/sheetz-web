'use server';

import { randomUUID } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';

const missing = (e) => /relation|column|schema cache|does not exist/i.test(e?.message || '');
const num = (v) => Number(v) || 0;

async function ctx() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!(can(profile.role, 'changeStatus') || can(profile.role, 'seeOwnOnly') || can(profile.role, 'collectPayment') || can(profile.role, 'seeAllJobs')))
    return { err: 'Not allowed.' };
  return { user, profile, sb: getSupabaseAdmin() };
}

// Build a customer-safe snapshot of the cart and create a shareable estimate (token link). The snapshot
// holds ONLY customer-facing fields + customer-visible photos — no cost/margin/min ever reaches it.
// lines: [{ itemId, soldPrice, quantity }]. opts: { headline, tierKey, bundleSlug }.
export async function createEstimate(jobId, lines = [], opts = {}) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  if (!Array.isArray(lines) || lines.length === 0) return { ok: false, msg: 'Add at least one item first.' };

  const { data: job } = await c.sb.from('jobs').select('id, job_number, customer_id, tech_id, customers(name)').eq('id', jobId).maybeSingle();
  if (!job) return { ok: false, msg: 'Job not found.' };

  const itemIds = [...new Set(lines.map((l) => l.itemId).filter(Boolean))];
  const { data: items, error: ie } = await c.sb.from('pricebook_items').select('id, name, customer_name, customer_description, short_description, retail_price, warranty_text, primary_photo_url, pdf_url').in('id', itemIds);
  if (ie) return { ok: false, msg: missing(ie) ? 'Run supabase/104_pricebook.sql first.' : ie.message };
  const byId = {}; (items || []).forEach((i) => { byId[i.id] = i; });

  // Customer-visible gallery photos per item (pricebook_media). Best-effort.
  const mediaByItem = {};
  try {
    const { data: media } = await c.sb.from('pricebook_media').select('item_id, media_type, url, customer_visible, sort_order').in('item_id', itemIds).eq('customer_visible', true).order('sort_order');
    (media || []).forEach((m) => { (mediaByItem[m.item_id] = mediaByItem[m.item_id] || []).push(m); });
  } catch (_) {}

  const snapLines = lines.map((l) => {
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
  if (!snapLines.length) return { ok: false, msg: 'No sellable items in the cart.' };

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
    lines: snapLines, subtotal, card_fee: cardFee, status: 'sent', created_by: c.user.id,
  };
  const { error } = await c.sb.from('pricebook_estimates').insert(row);
  if (error) return { ok: false, msg: missing(error) ? 'Run supabase/106_pricebook_estimates.sql first.' : error.message };

  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: row.tech_name, role: c.profile.role, action: 'estimate.create', entity: 'pricebook_estimate', entity_id: token, detail: { lines: snapLines.length, subtotal } }); } catch (_) {}
  return { ok: true, token, url: `/e/${token}`, msg: 'Estimate ready to present or send.' };
}
