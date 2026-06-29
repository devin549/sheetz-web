'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { postToDiscord } from '@/lib/discord';
import { marginPct } from '@/lib/pricebookEngine';
import { createInvoiceFromEstimate } from '@/lib/invoiceFromEstimate';
import { TERMS_VERSION } from '@/lib/estimateTerms';

// PUBLIC actions — authenticated by the unguessable token in the link, NOT a login. The customer can only
// touch their own estimate. No internal data is ever returned to the browser.
const clean = (v, n = 800) => String(v == null ? '' : v).trim().slice(0, n);

async function loadByToken(token) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('pricebook_estimates').select('*').eq('token', clean(token, 64)).maybeSingle();
  if (error || !data) return { sb, est: null };
  return { sb, est: data };
}
const notify = async (msg) => { try { await postToDiscord(msg); } catch (_) {} };

// 🔒 Atomic first-write-wins lock. The same estimate token can be open on the tech's iPad AND texted AND
// emailed at once. To make a terminal close (approve/decline) un-double-bookable, we move the status with a
// CONDITIONAL update — `where id=<id> and status not in (already-terminal)` — and ask Postgres to RETURN the
// rows it actually changed. If it returns a row, THIS channel won the race and may proceed; if it returns
// none, another channel already closed it (or the column-degrade path below handles an un-migrated extra
// column). First write wins; every other channel falls through to the friendly locked-state message.
// `extra` holds the rest of the status write (responded_at, proof fields, tier write, approval_channel…).
const TERMINAL = ['approved', 'declined'];
async function lockTo(sb, est, newStatus, extra = {}) {
  const guard = (q) => q.eq('id', est.id).not('status', 'in', `(${TERMINAL.join(',')})`).select('id');
  let res = await guard(sb.from('pricebook_estimates').update({ status: newStatus, ...extra }));
  // Degrade: if a NOT-YET-MIGRATED column (e.g. approval_channel) is in `extra`, retry with just status +
  // responded_at so the close still lands atomically. We never lose the race-guard, only the optional column.
  if (res.error && /column|schema cache|does not exist/i.test(res.error.message || '')) {
    res = await guard(sb.from('pricebook_estimates').update({ status: newStatus, responded_at: extra.responded_at || new Date().toISOString() }));
  }
  if (res.error) return { won: false, error: res.error };
  return { won: Array.isArray(res.data) && res.data.length > 0 };
}
// Map a customer-side approval method to the snapshot's approval_channel ('text'|'email'|'ipad'|'in_person').
function channelOf(opts = {}) {
  const c = clean(opts.channel || opts.method || '', 16).toLowerCase();
  return ['text', 'email', 'ipad', 'in_person', 'link'].includes(c) ? c : 'link';
}

// Best-effort device fingerprint for the proof record (server-side; the customer can't spoof it).
function clientMeta() {
  try {
    const h = headers();
    const fwd = h.get('x-forwarded-for') || '';
    const ip = (fwd.split(',')[0] || '').trim() || h.get('x-real-ip') || '';
    return { ip: ip.slice(0, 64), ua: (h.get('user-agent') || '').slice(0, 400) };
  } catch (_) { return { ip: '', ua: '' }; }
}
// Append-only proof timeline. Never throws into the caller.
async function logEvent(sb, est, type, extra = {}) {
  try {
    await sb.from('pricebook_estimate_events').insert({
      estimate_id: est.id, token: est.token, event_type: type,
      method: extra.method || null, actor: extra.actor || null, actor_role: extra.actorRole || 'customer',
      ip: extra.ip || null, user_agent: extra.ua || null, note: extra.note || null,
      amount: extra.amount == null ? null : extra.amount, proof_url: extra.proofUrl || null,
    });
  } catch (_) {}
}

// 🪜 Choose a tier at the close — the customer picked Good/Better/Best from the ladder. Re-point the active
// snapshot (`lines`/`subtotal`/`card_fee`) to that tier so the existing approve → usage conversion sells
// exactly what they chose, and record `selected_tier_key`. No price moves — we only switch WHICH tier's
// (owner-set) prices are active. Returns the chosen tier's subtotal so the UI can confirm.
export async function chooseTier(token, tierKey) {
  const { sb, est } = await loadByToken(token);
  if (!est) return { ok: false, msg: 'Estimate not found.' };
  if (TERMINAL.includes(est.status)) return { ok: false, msg: 'This estimate is already finalized.' };
  const key = clean(tierKey, 16);
  const tiers = Array.isArray(est.tiers) ? est.tiers : [];
  const tier = tiers.find((t) => t && t.key === key);
  if (!tier) return { ok: false, msg: 'That option is no longer available.' };
  const lines = Array.isArray(tier.lines) ? tier.lines : [];
  if (!lines.length) return { ok: false, msg: 'That option has no items.' };
  const subtotal = Number(tier.subtotal) || lines.reduce((s, l) => s + (Number(l.price) || 0), 0);
  const cardFee = Math.round(subtotal * 0.04 * 100) / 100;
  try {
    // Conditional write — never re-point the snapshot after the close is finalized (races approve/decline).
    const { data: rows, error } = await sb.from('pricebook_estimates')
      .update({ lines, subtotal, card_fee: cardFee, selected_tier_key: key, tier_key: key })
      .eq('id', est.id).not('status', 'in', `(${TERMINAL.join(',')})`).select('id');
    if (error) throw error;
    if (!rows || !rows.length) return { ok: false, msg: 'This estimate was already finalized.' };
  } catch (e) { return { ok: false, msg: 'Could not select that option — try again.' }; }
  await logEvent(sb, est, 'tier_selected', { method: 'link', actor: est.customer_name || 'Customer', note: tier.name || key, amount: subtotal });
  revalidatePath(`/e/${est.token}`);
  return { ok: true, subtotal, name: tier.name || key };
}

// ✅ Approve — captures the proof (typed name + consent + device/IP + timeline) and converts the snapshot
// to job_pricebook_usage rows tied to the job/customer/tech. opts: { name, consent, tierKey }.
export async function approveEstimate(token, opts = {}) {
  const { sb, est } = await loadByToken(token);
  if (!est) return { ok: false, msg: 'Estimate not found.' };
  if (est.status === 'approved') return { ok: true, msg: 'Already approved — thank you!' };

  // Proof gate: we need a typed name and an explicit consent so an approval can't be disputed later.
  const name = clean(opts.name, 120);
  if (!name) return { ok: false, msg: 'Please type your name to approve.' };
  if (opts.consent !== true) return { ok: false, msg: 'Please check the box to authorize the work.' };
  const { ip, ua } = clientMeta();
  const sig = (typeof opts.signature === 'string' && /^data:image\//.test(opts.signature)) ? opts.signature.slice(0, 300000) : null;

  // Lock in the chosen tier (if a ladder was sent). Approving from a specific tier card carries its key, so
  // we sell exactly what the customer tapped even if `chooseTier` didn't run first. No prices move — we only
  // pick WHICH owner-set tier is active.
  const tierKey = clean(opts.tierKey, 16);
  const allTiers = Array.isArray(est.tiers) ? est.tiers : [];
  const chosen = tierKey ? allTiers.find((t) => t && t.key === tierKey) : null;
  const lines = chosen && Array.isArray(chosen.lines) && chosen.lines.length ? chosen.lines : (Array.isArray(est.lines) ? est.lines : []);
  const total = chosen ? (Number(chosen.subtotal) || lines.reduce((s, l) => s + (Number(l.price) || 0), 0)) : Number(est.subtotal || 0);
  const consentText = `I, ${name}, approve this estimate of $${total.toLocaleString()} from Clog Busterz Plumbing, authorize the work described, and agree to the Clog Busterz Work Authorization & Terms and Conditions (${TERMS_VERSION}).`;

  const itemIds = lines.map((l) => l.itemId).filter(Boolean);
  const costById = {};
  if (itemIds.length) {
    try { const { data: items } = await sb.from('pricebook_items').select('id, estimated_material_cost, estimated_labor_hours').in('id', itemIds); (items || []).forEach((i) => { costById[i.id] = i; }); } catch (_) {}
  }
  const nowISO = new Date().toISOString();
  const usage = lines.filter((l) => l.itemId).map((l) => {
    const it = costById[l.itemId] || {};
    const cost = Number(it.estimated_material_cost) || 0;
    const price = Number(l.price) || 0;
    return { job_id: est.job_id, job_number: est.job_number, customer_id: est.customer_id, tech_id: est.tech_id, item_id: l.itemId, quantity: Number(l.quantity) || 1, sold_price: price, actual_cost: cost, estimated_labor_hours: Number(it.estimated_labor_hours) || 0, margin_pct: marginPct({ retail_price: price, estimated_material_cost: cost }), source: 'customer_approval', sold_at: nowISO };
  });
  // Persist the locked-in tier so the approved record reflects exactly what was sold.
  const tierWrite = chosen ? { lines, subtotal: total, card_fee: Math.round(total * 0.04 * 100) / 100, selected_tier_key: chosen.key, tier_key: chosen.key } : {};
  const channel = channelOf(opts);
  // ── ATOMIC GUARD ── flip to 'approved' ONLY if not already terminal. If we lose the race, another channel
  // (iPad / text / email) already closed it → return the friendly "already approved" without writing usage.
  const lock = await lockTo(sb, est, 'approved', {
    responded_at: nowISO, approved_name: name, approval_method: 'link', approval_channel: channel,
    approver_ip: ip, approver_user_agent: ua, consent_text: consentText, ...tierWrite,
  });
  if (!lock.won) { revalidatePath(`/e/${est.token}`); return { ok: true, msg: 'Already approved — thank you!' }; }
  // Store the drawn signature SEPARATELY + best-effort, so a pre-migration-139 DB can't break the approval.
  if (sig) { try { await sb.from('pricebook_estimates').update({ signature_data: sig, signed_at: nowISO }).eq('id', est.id); } catch (_) {} }
  // We won the race — NOW write the usage rows (so a losing channel never double-converts the sale).
  if (usage.length) { try { await sb.from('job_pricebook_usage').insert(usage); } catch (_) {} }
  // 🧾→💳 Bridge: the approval becomes an INVOICE (open, due now or Net-30). Best-effort; never blocks approval.
  try { await createInvoiceFromEstimate(sb, { customerId: est.customer_id, jobId: est.job_id, jobNumber: est.job_number, total }); } catch (_) {}
  // 🔁 Reflect the result back on the WORK ORDER so the cockpit shows it WITHOUT the tech sitting on the
  // pricebook tab — and an estimate job's closeout gate unblocks (the customer's YES IS the outcome).
  // Best-effort; never blocks the customer's approval.
  try { await sb.from('jobs').update({ estimate_outcome: 'sold_now' }).eq('id', est.job_id); } catch (_) {}
  // If the original job is already closed (a later/remote approval), drop an UNASSIGNED · UNSCHEDULED work
  // request into the OFFICE's queue — the office schedules + assigns it (a tech never schedules). If the
  // job's still open, the tech does the work on this visit; nothing new is created.
  let queued = null;
  try {
    const { data: job } = await sb.from('jobs').select('id, status, customer_id, job_type').eq('id', est.job_id).maybeSingle();
    const closed = job && /done|complete|closed|cancel/.test(String(job.status || '').toLowerCase());
    if (closed) {
      // tech_id null + scheduled_at null → lands in the office's "Unassigned · no time set" tray to schedule.
      const base = { customer_id: job.customer_id || est.customer_id, tech_id: null, scheduled_at: null, job_type: `Approved estimate: ${est.headline || job.job_type || 'work'}`.slice(0, 120), status: 'scheduled', priority: 'high', notes: `Customer approved estimate (${est.token}) for $${total.toLocaleString()} — OFFICE: schedule + assign.` };
      let ins = await sb.from('jobs').insert(base).select('id').single();
      if (ins.error) { const { priority, notes, ...core } = base; ins = await sb.from('jobs').insert(core).select('id').single(); }
      if (!ins.error) queued = ins.data;
    }
  } catch (_) {}
  await logEvent(sb, est, 'approved', { method: 'link', actor: name, actorRole: 'customer', ip, ua, amount: total, note: consentText });
  await notify(`✅ **Estimate APPROVED — signed proof captured** · ${name}${est.job_number ? ` · job ${est.job_number}` : ''} approved ${'$' + total.toLocaleString()} on their device (${est.tech_name || ''}).${queued ? ` 📥 In the office tray — SCHEDULE + ASSIGN it.` : ''}`);
  revalidatePath(`/e/${est.token}`);
  return { ok: true, msg: 'Approved — thank you! Our office will reach out to get you on the schedule.', approvedName: name };
}

// ⭐ Join the Clog Club — INTEREST ONLY. Tapping the member-savings banner does NOT enroll the customer and
// does NOT change the quoted price. It tells the office the customer wants to hear about membership, and drops
// a proof-timeline event so the tech/office can follow up + actually enroll them properly. Honest nudge.
export async function joinClogClub(token) {
  const { sb, est } = await loadByToken(token);
  if (!est) return { ok: false, msg: 'Estimate not found.' };
  const plan = est.member_ctx && typeof est.member_ctx === 'object' ? est.member_ctx : null;
  const planName = clean(plan?.name || 'Clog Club', 80);
  // Log + ping the office only ONCE per estimate — a repeated tap (or a scripted POST on the token) must not
  // spam the channel or pile up rows. The friendly message still returns every time.
  let already = false;
  try { const { data } = await sb.from('pricebook_estimate_events').select('id').eq('estimate_id', est.id).eq('event_type', 'membership_interest').limit(1); already = !!(data && data.length); } catch (_) {}
  if (!already) {
    await logEvent(sb, est, 'membership_interest', { method: 'link', actor: est.customer_name || 'Customer', note: `Interested in ${planName}` });
    await notify(`⭐ **${planName} interest** — ${est.customer_name || 'Customer'}${est.job_number ? ` · job ${est.job_number}` : ''} tapped "Join" on their estimate. Follow up to enroll them (${est.tech_name || ''}).`);
  }
  return { ok: true, msg: `Great — we'll tell you all about the ${planName} and how to join. Nothing changes on this estimate.` };
}

// ❓ Ask a question — routes to the office, customer never waits on hold.
export async function askQuestion(token, text) {
  const { sb, est } = await loadByToken(token);
  if (!est) return { ok: false, msg: 'Estimate not found.' };
  const q = clean(text, 600);
  if (!q) return { ok: false, msg: 'Type your question first.' };
  await sb.from('pricebook_estimates').update({ status: 'question', customer_question: q, responded_at: new Date().toISOString() }).eq('id', est.id);
  await logEvent(sb, est, 'question', { method: 'link', actor: est.customer_name || 'Customer', note: q });
  await notify(`❓ **Estimate question** — ${est.customer_name || 'Customer'}${est.job_number ? ` · job ${est.job_number}` : ''}: "${q.slice(0, 240)}" (for ${est.tech_name || ''}).`);
  revalidatePath(`/e/${est.token}`);
  return { ok: true, msg: "Got it — we'll get right back to you." };
}

// 💳 Request deposit — we NEVER charge here; the office sends a secure payment link.
export async function requestDeposit(token) {
  const { sb, est } = await loadByToken(token);
  if (!est) return { ok: false, msg: 'Estimate not found.' };
  // Non-terminal, but must not stomp a close that already won the race on another channel.
  const lock = await lockTo(sb, est, 'deposit_requested', { responded_at: new Date().toISOString() });
  if (!lock.won) { revalidatePath(`/e/${est.token}`); return { ok: true, msg: est.status === 'declined' ? 'This estimate was declined.' : 'Already approved — our office will reach out.' }; }
  await logEvent(sb, est, 'deposit_requested', { method: 'link', actor: est.customer_name || 'Customer' });
  await notify(`💳 **Deposit requested** — ${est.customer_name || 'Customer'}${est.job_number ? ` · job ${est.job_number}` : ''} wants to put a deposit down. Send a secure pay link (${est.tech_name || ''}).`);
  revalidatePath(`/e/${est.token}`);
  return { ok: true, msg: "We'll text you a secure link to put your deposit down." };
}

// 🙅 Decline — captures the reason + spins up a 7-day follow-up so it never just disappears.
export async function declineEstimate(token, reason) {
  const { sb, est } = await loadByToken(token);
  if (!est) return { ok: false, msg: 'Estimate not found.' };
  const r = clean(reason, 400);
  const followUp = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  // ── ATOMIC GUARD ── decline only if not already terminal. If they approved on another channel a beat ago,
  // the approval wins and we surface that instead of overwriting it with a decline.
  const lock = await lockTo(sb, est, 'declined', { decline_reason: r || null, follow_up_at: followUp, responded_at: new Date().toISOString() });
  if (!lock.won) { revalidatePath(`/e/${est.token}`); return { ok: true, msg: est.status === 'approved' ? 'This estimate was already approved — thank you!' : 'Thanks for letting us know.' }; }
  // 🔁 Reflect the NO back on the work order (cockpit shows it; an estimate job's gate unblocks — declined is
  // still a recorded outcome). Best-effort.
  try { await sb.from('jobs').update({ estimate_outcome: 'not_sold' }).eq('id', est.job_id); } catch (_) {}
  await logEvent(sb, est, 'declined', { method: 'link', actor: est.customer_name || 'Customer', note: r || null });
  await notify(`🙅 **Estimate declined** — ${est.customer_name || 'Customer'}${est.job_number ? ` · job ${est.job_number}` : ''}${r ? `: "${r.slice(0, 200)}"` : ''}. Follow up by ${followUp}.`);
  revalidatePath(`/e/${est.token}`);
  return { ok: true, msg: 'Thanks for letting us know — no pressure at all.' };
}
