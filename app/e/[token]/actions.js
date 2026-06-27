'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { postToDiscord } from '@/lib/discord';
import { marginPct } from '@/lib/pricebookEngine';

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

// ✅ Approve — captures the proof (typed name + consent + device/IP + timeline) and converts the snapshot
// to job_pricebook_usage rows tied to the job/customer/tech. opts: { name, consent }.
export async function approveEstimate(token, opts = {}) {
  const { sb, est } = await loadByToken(token);
  if (!est) return { ok: false, msg: 'Estimate not found.' };
  if (est.status === 'approved') return { ok: true, msg: 'Already approved — thank you!' };

  // Proof gate: we need a typed name and an explicit consent so an approval can't be disputed later.
  const name = clean(opts.name, 120);
  if (!name) return { ok: false, msg: 'Please type your name to approve.' };
  if (opts.consent !== true) return { ok: false, msg: 'Please check the box to authorize the work.' };
  const { ip, ua } = clientMeta();
  const total = Number(est.subtotal || 0);
  const consentText = `I, ${name}, approve this estimate of $${total.toLocaleString()} from Clog Busterz Plumbing and authorize the work described.`;

  const lines = Array.isArray(est.lines) ? est.lines : [];
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
  if (usage.length) { try { await sb.from('job_pricebook_usage').insert(usage); } catch (_) {} }
  try {
    await sb.from('pricebook_estimates').update({ status: 'approved', responded_at: nowISO, approved_name: name, approval_method: 'link', approver_ip: ip, approver_user_agent: ua, consent_text: consentText }).eq('id', est.id);
  } catch (_) { await sb.from('pricebook_estimates').update({ status: 'approved', responded_at: nowISO }).eq('id', est.id); }
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
  await sb.from('pricebook_estimates').update({ status: 'deposit_requested', responded_at: new Date().toISOString() }).eq('id', est.id);
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
  await sb.from('pricebook_estimates').update({ status: 'declined', decline_reason: r || null, follow_up_at: followUp, responded_at: new Date().toISOString() }).eq('id', est.id);
  await logEvent(sb, est, 'declined', { method: 'link', actor: est.customer_name || 'Customer', note: r || null });
  await notify(`🙅 **Estimate declined** — ${est.customer_name || 'Customer'}${est.job_number ? ` · job ${est.job_number}` : ''}${r ? `: "${r.slice(0, 200)}"` : ''}. Follow up by ${followUp}.`);
  revalidatePath(`/e/${est.token}`);
  return { ok: true, msg: 'Thanks for letting us know — no pressure at all.' };
}
