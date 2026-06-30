'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { scopeJob } from './scope';
import { createInvoiceFromEstimate } from '@/lib/invoiceFromEstimate';
import { postToDiscord } from '@/lib/discord';
import { marginPct, canOverrideMinimum } from '@/lib/pricebookEngine';
import { financingPartner } from '@/lib/financing';
import { sendSms } from '@/lib/twilio';
import { sendOne, isEmailConfigured, appBaseUrl } from '@/lib/email';

const missing = (e) => /relation|column|schema cache|does not exist/i.test(e?.message || '');
const num = (v) => Number(v) || 0;
const clean = (v, n = 400) => String(v == null ? '' : v).trim().slice(0, n);
const APPROVAL_METHODS = ['phone', 'in_person', 'text', 'email'];
const MOST_CHOSEN_THRESHOLD = 20;   // approvals needed before we make an honest "Most chosen" claim

// 🏅 TRUE "most chosen" — count APPROVED estimates by the tier the customer actually selected, scoped to this
// bundle (job type) so the badge reflects what real people on real jobs picked. Returns the genuinely
// most-selected tier key ONLY when the sample clears the threshold; otherwise null → the close falls back to
// the always-true "Recommended" wording. Never fabricates popularity. Best-effort; never throws.
async function mostChosenTier(sb, bundleSlug) {
  try {
    let q = sb.from('pricebook_estimates').select('selected_tier_key, tier_key').eq('status', 'approved');
    if (bundleSlug) q = q.eq('bundle_slug', bundleSlug);
    const { data, error } = await q.limit(5000);
    if (error || !Array.isArray(data)) return { key: null, total: 0, backed: false };
    const tally = {}; let total = 0;
    for (const r of data) {
      const k = r.selected_tier_key || r.tier_key;
      if (!k) continue;
      tally[k] = (tally[k] || 0) + 1; total += 1;
    }
    let key = null, max = -1;
    for (const k of Object.keys(tally)) { if (tally[k] > max) { max = tally[k]; key = k; } }
    const backed = total >= MOST_CHOSEN_THRESHOLD && key != null;
    return { key: backed ? key : null, total, backed, tally };
  } catch (_) { return { key: null, total: 0, backed: false }; }
}

async function ctx() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: 'Sign in required.' };
  const profile = await loadProfile(user);
  // Require an ACTIONABLE permission — never a read-only role. seeAllJobs/seeOwnOnly alone (a Viewer) must
  // NOT be able to send a text/email (cost + spam) or create estimates; techs keep access via changeStatus.
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
  const s = await scopeJob(c, jobId); if (s.err) return { ok: false, msg: s.err };
  if (!Array.isArray(lines) || lines.length === 0) return { ok: false, msg: 'Add at least one item first.' };

  const { data: job } = await c.sb.from('jobs').select('id, job_number, customer_id, tech_id, customers(name)').eq('id', jobId).maybeSingle();
  if (!job) return { ok: false, msg: 'Job not found.' };

  // Gather every itemId referenced by the flat cart AND every tier so we fetch customer-safe data ONCE.
  // Custom lines (l.custom) carry no catalog itemId — they're ad-hoc, priced per-job by the tech, and pass
  // straight through to the snapshot (never a catalog lookup, never job_pricebook_usage, never a catalog price).
  const tierInput = Array.isArray(opts.tiers) ? opts.tiers : [];
  const allLineRefs = [...lines, ...tierInput.flatMap((t) => Array.isArray(t.lines) ? t.lines : [])];
  const itemIds = [...new Set(allLineRefs.map((l) => l.itemId).filter(Boolean))];
  const { data: items, error: ie } = await c.sb.from('pricebook_items').select('id, name, customer_name, customer_description, short_description, retail_price, minimum_price, warranty_text, primary_photo_url, pdf_url').in('id', itemIds);
  if (ie) return { ok: false, msg: missing(ie) ? 'Run supabase/104_pricebook.sql first.' : ie.message };
  const byId = {}; (items || []).forEach((i) => { byId[i.id] = i; });

  // Minimum-price floor — MIRROR recordSale so the Present/Send (estimate) path can't book sub-floor prices
  // either (it previously fetched no minimum_price and skipped the check). Covers the flat cart AND every tier
  // line; non-managers are blocked and told it needs manager approval. (Ad-hoc custom lines have no catalog
  // minimum — a separate known gap.) Uses the effective price (sold → retail) so a retail line never blocks.
  const belowMin = [];
  for (const l of allLineRefs) {
    if (l.custom || !l.itemId) continue;
    const it = byId[l.itemId]; if (!it) continue;
    const min = it.minimum_price == null ? null : Number(it.minimum_price);
    const sold = Number(l.soldPrice) || Number(it.retail_price) || 0;
    if (min != null && sold < min) belowMin.push(it.customer_name || it.name);
  }
  if (belowMin.length && !canOverrideMinimum(c.profile.role)) {
    return { ok: false, needsApproval: true, msg: `Below minimum on ${[...new Set(belowMin)].join(', ')} — needs manager approval to send.` };
  }

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

  // Off-book CUSTOM lines bypass the catalog floor + margin-watch — flag them to the office (#dispatch) for
  // visibility (the "flag for manager review" rule). Best-effort; never blocks the estimate.
  const customLines = snapLines.filter((l) => l.custom);
  if (customLines.length) {
    try { await postToDiscord(`📝 **Off-book custom pricing** on an estimate${job.job_number ? ` · job ${job.job_number}` : ''} by ${c.profile.name || c.user.email}:\n${customLines.map((l) => `• ${l.name} — $${Number(l.price || 0).toLocaleString()}`).join('\n')}\nReview in the job's 💵 Quote.`, { to: 'office' }); } catch (_) {}
  }

  // Bundle-level Good/Better/Best CAVEATS (migration 127, loss-contrast lever). Best-effort + defensive: absent
  // before the migration → no caveats → the close renders nothing for that lever. Honest copy authored by the
  // owner/GBB builder; we only thread + render it.
  const caveatByKey = {};
  if (opts.bundleSlug) {
    try {
      const { data: bc } = await c.sb.from('pricebook_bundles').select('good_caveat, better_caveat, best_caveat').eq('slug', opts.bundleSlug).maybeSingle();
      if (bc) { caveatByKey.good = clean(bc.good_caveat, 240); caveatByKey.better = clean(bc.better_caveat, 240); caveatByKey.best = clean(bc.best_caveat, 240); }
    } catch (_) {}
  }

  // Build the customer-safe ladder. Only customer fields survive — icon/pitch/bestFor/warranty/recommended/caveat
  // are presentation copy (no prices moved here). Drop any tier that resolves to nothing.
  const TIER_ICON = { good: '🥉', better: '🥈', best: '🥇' };
  const tierSnaps = tierInput.map((t) => {
    const tLines = snapOf(t.lines);
    if (!tLines.length) return null;
    const key = clean(t.key, 16) || 'tier';
    return {
      key,
      name: clean(t.name, 60) || (t.key ? String(t.key) : 'Option'),
      icon: t.icon || TIER_ICON[t.key] || '🔧',
      pitch: clean(t.pitch, 240),
      bestFor: clean(t.bestFor, 160),
      warranty: clean(t.warranty, 160),
      caveat: clean(t.caveat, 240) || caveatByKey[key] || '',   // honest "does NOT cover" line (per-tier override → bundle)
      includes: tLines.map((l) => l.name),
      lines: tLines,
      subtotal: tLines.reduce((s, l) => s + l.price, 0),
      recommended: !!t.recommended,
    };
  }).filter(Boolean);
  // Guarantee exactly one recommended (the middle if the tech didn't flag one).
  if (tierSnaps.length && !tierSnaps.some((t) => t.recommended)) tierSnaps[Math.min(1, tierSnaps.length - 1)].recommended = true;
  // 🏅 Honest "most chosen": if enough real approvals back a specific tier for THIS bundle, flag that exact
  // tier so the close badges it truthfully. Below threshold → no tier gets it → close shows "Recommended".
  if (tierSnaps.length) {
    const mc = await mostChosenTier(c.sb, opts.bundleSlug);
    tierSnaps.forEach((t) => { t.mostChosen = !!(mc.key && t.key === mc.key); });
  }
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

  // ⭐ Clog Club member-savings context — snapshot the EXISTING active plan rate so the close can DISPLAY what
  // the customer would save by joining (a nudge, never a price move / auto-discount). Best-effort + defensive:
  // absent before migration 118 → no banner. Honest: this is the catalog discount %, not an edit.
  let memberPlan = null;
  try {
    const { data: mp } = await c.sb.from('membership_plans').select('slug, name, discount_pct, monthly_price, perks').eq('active', true).order('sort_order').limit(1).maybeSingle();
    if (mp && Number(mp.discount_pct) > 0) memberPlan = { slug: mp.slug, name: mp.name || 'Clog Club', discountPct: Number(mp.discount_pct) || 0, monthlyPrice: Number(mp.monthly_price) || null, perks: mp.perks || '' };
  } catch (_) {}

  // 💳 Financing context — snapshot which partner (if any) is configured + their standard terms so the close
  // can show a REAL "as low as $X/mo" + apply link. NO partner → close shows the honest no-number prompt.
  const partner = financingPartner();
  const financing = partner ? { partner: partner.name, slug: partner.slug, months: partner.months, aprPct: partner.aprPct, applyUrl: partner.applyUrl } : null;

  const row = {
    token, job_id: jobId, job_number: job.job_number || null, customer_id: job.customer_id || null,
    customer_name: (job.customers && job.customers.name) || null, tech_id: job.tech_id || null, tech_name: c.profile.name || c.user.email,
    bundle_slug: opts.bundleSlug || null, tier_key: opts.tierKey || null, headline,
    customer_description: customerDescription, warranty_text: warrantyText, approve_text: approveText,
    lines: snapLines, tiers: tierSnaps, subtotal, card_fee: cardFee, status: 'sent', created_by: c.user.id,
    member_ctx: memberPlan, financing_ctx: financing,   // levers #3/#4 context (migration 127); dropped below if un-migrated
  };
  let { error } = await c.sb.from('pricebook_estimates').insert(row);
  // Backward-compat: if the lever-context columns (migration 127) aren't migrated yet, drop them and retry so
  // sending never hard-fails on an un-run migration.
  if (error && /(member_ctx|financing_ctx)/.test(error.message || '') && missing(error)) {
    const { member_ctx: _m, financing_ctx: _f, ...noCtx } = row;
    ({ error } = await c.sb.from('pricebook_estimates').insert(noCtx));
  }
  // Backward-compat: if the `tiers` column isn't migrated yet, fall back to the flat single-tier insert so
  // sending an estimate never hard-fails on an un-run migration.
  if (error && /tiers/.test(error.message || '') && missing(error)) {
    const { tiers: _drop, member_ctx: _m2, financing_ctx: _f2, ...flat } = row;
    ({ error } = await c.sb.from('pricebook_estimates').insert(flat));
  }
  if (error) return { ok: false, msg: missing(error) ? 'Run supabase/106_pricebook_estimates.sql first.' : error.message };

  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: row.tech_name, role: c.profile.role, action: 'estimate.create', entity: 'pricebook_estimate', entity_id: token, detail: { lines: snapLines.length, subtotal } }); } catch (_) {}
  try { await c.sb.from('pricebook_estimate_events').insert({ token, event_type: 'sent', method: 'link', actor: row.tech_name, actor_role: 'tech', amount: subtotal }); } catch (_) {}
  return { ok: true, token, url: `/e/${token}`, msg: 'Estimate ready to present or send.' };
}

// ── Build the customer-facing absolute URL for the token. Prefer APP_URL/Vercel prod; fall back to the live
// request host so a texted/emailed link is always tappable from the customer's phone. ──
function estimateUrl(token) {
  let base = appBaseUrl();
  if (!base) { try { const h = headers(); const host = h.get('x-forwarded-host') || h.get('host'); const proto = h.get('x-forwarded-proto') || 'https'; if (host) base = `${proto}://${host}`; } catch (_) {} }
  return `${base || ''}/e/${token}`;
}

// Load an estimate the current user is allowed to act on + the customer's delivery + consent fields.
async function loadSendCtx(token) {
  const c = await ctx(); if (c.err) return { err: c.err };
  const tk = clean(token, 64); if (!tk) return { err: 'No estimate.' };
  const { data: est } = await c.sb.from('pricebook_estimates').select('id, token, job_id, job_number, customer_id, customer_name, headline, subtotal, tech_name').eq('token', tk).maybeSingle();
  if (!est) return { err: 'Estimate not found.' };
  let cust = {};
  if (est.customer_id) {
    try { const { data } = await c.sb.from('customers').select('name, phone, phones, email, sms_consent').eq('id', est.customer_id).maybeSingle(); cust = data || {}; } catch (_) {}
  }
  const phone = cust.phone || (Array.isArray(cust.phones) ? cust.phones[0] : cust.phones) || '';
  return { c, est, cust, phone, email: cust.email || '', smsConsent: !!cust.sms_consent };
}

// 💬 TEXT the link — GATED ON CONSENT. We never text a customer who hasn't opted in (no-auto-send / TCPA).
export async function sendEstimateText(token) {
  const x = await loadSendCtx(token); if (x.err) return { ok: false, msg: x.err };
  const { c, est, phone, smsConsent } = x;
  if (!phone) return { ok: false, msg: 'No phone number on file for this customer.' };
  if (!smsConsent) return { ok: false, msg: 'This customer hasn’t opted in to texts — present it on the iPad or email it instead.' };
  const url = estimateUrl(est.token);
  const body = `Here are your options from Clog Busterz Plumbing: ${url}\nNothing is charged until you approve. Reply STOP to opt out.`;
  const r = await sendSms(phone, body);
  if (!r.ok) return { ok: false, msg: r.msg || 'Text didn’t send.' };
  try { await c.sb.from('pricebook_estimate_events').insert({ estimate_id: est.id, token: est.token, event_type: 'sent', method: 'text', actor: est.tech_name, actor_role: 'tech', note: `Texted to ${r.to || phone}`, amount: Number(est.subtotal) || null }); } catch (_) {}
  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: est.tech_name, role: c.profile.role, action: 'estimate.send.text', entity: 'pricebook_estimate', entity_id: est.token, detail: { to: r.to || phone } }); } catch (_) {}
  return { ok: true, msg: `Texted to ${r.to || phone}.` };
}

// 📧 EMAIL the link — best-effort; needs EMAIL_API_KEY. Email isn't consent-gated the way SMS is, but we
// only send to the address on the customer record.
export async function sendEstimateEmail(token) {
  const x = await loadSendCtx(token); if (x.err) return { ok: false, msg: x.err };
  const { c, est, email } = x;
  if (!email) return { ok: false, msg: 'No email on file for this customer.' };
  if (!isEmailConfigured) return { ok: false, msg: 'Email isn’t set up yet (EMAIL_API_KEY) — text it or present on the iPad.' };
  const url = estimateUrl(est.token);
  const subject = `Your options from Clog Busterz Plumbing${est.job_number ? ` · job ${est.job_number}` : ''}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f3ef;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
    <div style="max-width:560px;margin:0 auto;padding:24px"><div style="background:#fff;border:1px solid #e3e0d8;border-radius:10px;overflow:hidden">
    <div style="background:#FF6B00;color:#fff;padding:14px 20px;font-weight:800;font-size:16px">Clog Busterz Plumbing</div>
    <div style="padding:22px 20px;font-size:14px"><p style="margin:0 0 14px;line-height:1.55">Hi${est.customer_name ? ' ' + esc(est.customer_name) : ''}, here are your options for the work we discussed.</p>
    <p style="margin:0 0 18px;line-height:1.55">Tap below to review the details and approve when you’re ready — nothing is charged until you do.</p>
    <p style="margin:0 0 8px"><a href="${esc(url)}" style="display:inline-block;background:#3fb56a;color:#06210f;font-weight:800;text-decoration:none;padding:13px 22px;border-radius:10px">View your estimate →</a></p>
    <p style="margin:14px 0 0;font-size:12px;color:#888">Or paste this link: ${esc(url)}</p></div>
    <div style="padding:14px 20px;border-top:1px solid #eee;font-size:11px;color:#888">Clog Busterz Plumbing · (859) 408-3382 · Prices held for this visit.</div></div></div></body></html>`;
  const r = await sendOne({ to: email, subject, html });
  if (!r.ok) return { ok: false, msg: 'Email didn’t send: ' + (r.error || 'unknown') };
  try { await c.sb.from('pricebook_estimate_events').insert({ estimate_id: est.id, token: est.token, event_type: 'sent', method: 'email', actor: est.tech_name, actor_role: 'tech', note: `Emailed to ${email}`, amount: Number(est.subtotal) || null }); } catch (_) {}
  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: est.tech_name, role: c.profile.role, action: 'estimate.send.email', entity: 'pricebook_estimate', entity_id: est.token, detail: { to: email } }); } catch (_) {}
  return { ok: true, msg: `Emailed to ${email}.` };
}

// 📱 Present on this iPad — no send. Mark it presented (proof timeline) and confirm the link to open.
export async function markPresented(token) {
  const x = await loadSendCtx(token); if (x.err) return { ok: false, msg: x.err };
  const { c, est } = x;
  try { await c.sb.from('pricebook_estimate_events').insert({ estimate_id: est.id, token: est.token, event_type: 'presented', method: 'ipad', actor: est.tech_name, actor_role: 'tech' }); } catch (_) {}
  return { ok: true, url: `/e/${est.token}`, msg: 'Presenting on this device.' };
}

// 🔁 Live status for the tech's iPad mirror — what the customer did on ANY channel. Lightweight: status,
// which tier they chose, and how the close arrived. Polled every ~10s by the tech client until terminal.
export async function getEstimateStatus(token) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const tk = clean(token, 64); if (!tk) return { ok: false, msg: 'No estimate.' };
  try {
    const { data: est } = await c.sb.from('pricebook_estimates').select('status, selected_tier_key, tier_key, approval_channel, approved_name, responded_at, viewed_at, subtotal').eq('token', tk).maybeSingle();
    if (!est) return { ok: false, msg: 'Estimate not found.' };
    const status = est.status || 'sent';
    const terminal = ['approved', 'declined'].includes(status);
    return {
      ok: true, status, terminal,
      selectedTierKey: est.selected_tier_key || est.tier_key || null,
      approvalChannel: est.approval_channel || null,
      approvedName: est.approved_name || null,
      respondedAt: est.responded_at || null,
      viewedAt: est.viewed_at || null,
      subtotal: Number(est.subtotal) || 0,
    };
  } catch (e) { return { ok: false, msg: 'Could not read status.' }; }
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

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
  const s = await scopeJob(c, est.job_id); if (s.err) return { ok: false, msg: s.err }; // can't witness an approval on another tech's job
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
  // 🧾→💳 Bridge: a recorded sale becomes an INVOICE (open, due now or Net-30). Best-effort.
  try { await createInvoiceFromEstimate(c.sb, { customerId: est.customer_id, jobId: est.job_id, jobNumber: est.job_number, total }); } catch (_) {}
  try { await c.sb.from('pricebook_estimate_events').insert({ estimate_id: est.id, token: tk, event_type: 'phone_approval', method, actor: name, actor_role: 'customer', note: consentText, amount: total }); } catch (_) {}
  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: c.profile.name || c.user.email, role: c.profile.role, action: 'estimate.manual_approval', entity: 'pricebook_estimate', entity_id: tk, detail: { name, method, total } }); } catch (_) {}
  try { await postToDiscord(`✅ **Approval logged (${methodLabel})** — ${name}${est.job_number ? ` · job ${est.job_number}` : ''} approved $${total.toLocaleString()}, witnessed by ${c.profile.name || ''}.`, { to: 'office' }); } catch (_) {}
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
