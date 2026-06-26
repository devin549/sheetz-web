'use server';

import { revalidatePath } from 'next/cache';
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

// ✅ Approve — converts the snapshot to job_pricebook_usage rows tied to the job/customer/tech.
export async function approveEstimate(token) {
  const { sb, est } = await loadByToken(token);
  if (!est) return { ok: false, msg: 'Estimate not found.' };
  if (est.status === 'approved') return { ok: true, msg: 'Already approved — thank you!' };

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
  await sb.from('pricebook_estimates').update({ status: 'approved', responded_at: nowISO }).eq('id', est.id);
  await notify(`✅ **Estimate APPROVED** — ${est.customer_name || 'Customer'}${est.job_number ? ` · job ${est.job_number}` : ''} approved ${'$' + Number(est.subtotal || 0).toLocaleString()} (${est.tech_name || ''}).`);
  revalidatePath(`/e/${est.token}`);
  return { ok: true, msg: 'Approved! Your tech will get you scheduled.' };
}

// ❓ Ask a question — routes to the office, customer never waits on hold.
export async function askQuestion(token, text) {
  const { sb, est } = await loadByToken(token);
  if (!est) return { ok: false, msg: 'Estimate not found.' };
  const q = clean(text, 600);
  if (!q) return { ok: false, msg: 'Type your question first.' };
  await sb.from('pricebook_estimates').update({ status: 'question', customer_question: q, responded_at: new Date().toISOString() }).eq('id', est.id);
  await notify(`❓ **Estimate question** — ${est.customer_name || 'Customer'}${est.job_number ? ` · job ${est.job_number}` : ''}: "${q.slice(0, 240)}" (for ${est.tech_name || ''}).`);
  revalidatePath(`/e/${est.token}`);
  return { ok: true, msg: "Got it — we'll get right back to you." };
}

// 💳 Request deposit — we NEVER charge here; the office sends a secure payment link.
export async function requestDeposit(token) {
  const { sb, est } = await loadByToken(token);
  if (!est) return { ok: false, msg: 'Estimate not found.' };
  await sb.from('pricebook_estimates').update({ status: 'deposit_requested', responded_at: new Date().toISOString() }).eq('id', est.id);
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
  await notify(`🙅 **Estimate declined** — ${est.customer_name || 'Customer'}${est.job_number ? ` · job ${est.job_number}` : ''}${r ? `: "${r.slice(0, 200)}"` : ''}. Follow up by ${followUp}.`);
  revalidatePath(`/e/${est.token}`);
  return { ok: true, msg: 'Thanks for letting us know — no pressure at all.' };
}
