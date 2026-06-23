'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { roleOf } from '@/lib/nav';
import { can } from '@/lib/roles';
import { getAnthropic, isAiConfigured, AI_MODEL } from '@/lib/anthropic';
import { revalidatePath } from 'next/cache';

// Only financial seats (owner/accounting/gm) may mark AR paid — never read-only viewer.
async function assertCanMark() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const role = roleOf(user);
  if (!user || !can(role, 'seeFinancials') || role === 'viewer') throw new Error('Your role can’t mark invoices paid.');
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Server not configured.');
  return { sb, email: user.email || '', role };
}

async function custName(sb, customerId) {
  if (!customerId) return '';
  const { data } = await sb.from('customers').select('name').eq('id', customerId).maybeSingle();
  return (data && data.name) || '';
}

// Mark one invoice paid → it drops out of past-due + logs to the AR ledger.
export async function markInvoicePaid(invoiceId) {
  let sb, email;
  try { ({ sb, email } = await assertCanMark()); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  if (!invoiceId) return { ok: false, msg: 'No invoice.' };
  const { data: inv } = await sb.from('invoices').select('balance, customer_id, invoice_number').eq('id', invoiceId).maybeSingle();
  const { error } = await sb.from('invoices').update({ status: 'paid' }).eq('id', invoiceId);
  if (error) return { ok: false, msg: error.message };
  try {
    await sb.from('ar_activity').insert({
      action: 'invoice_paid', customer_id: inv?.customer_id || null, customer_name: await custName(sb, inv?.customer_id),
      invoice_id: invoiceId, invoice_number: inv?.invoice_number || '', amount: Number(inv?.balance) || 0, by_email: email,
    });
  } catch (_) {}
  revalidatePath('/past-due');
  return { ok: true };
}

// Mark ALL of a customer's open invoices paid (whole balance cleared) + logs.
export async function markCustomerPaid(customerId) {
  let sb, email;
  try { ({ sb, email } = await assertCanMark()); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  if (!customerId) return { ok: false, msg: 'No customer.' };
  const { data: rows } = await sb.from('invoices').select('balance').eq('customer_id', customerId).eq('status', 'open');
  const amount = (rows || []).reduce((a, r) => a + (Number(r.balance) || 0), 0);
  const { error } = await sb.from('invoices').update({ status: 'paid' }).eq('customer_id', customerId).eq('status', 'open');
  if (error) return { ok: false, msg: error.message };
  try {
    await sb.from('ar_activity').insert({
      action: 'customer_paid', customer_id: customerId, customer_name: await custName(sb, customerId),
      amount, by_email: email,
    });
  } catch (_) {}
  revalidatePath('/past-due');
  return { ok: true };
}

// ── Collections cascade (ported from _CollectionsLog + Lien Watch) ──
const CHANNELS = ['text', 'email', 'call', 'letter', 'certified', 'packet'];
const bucketOf = (days) => (days == null ? '0-30' : days > 180 ? '180+' : days > 90 ? '90-180' : days > 60 ? '61-90' : days > 30 ? '31-60' : '0-30');

// Log one contact attempt on a customer's account.
export async function logContact(customerId, channel, note) {
  let sb, email;
  try { ({ sb, email } = await assertCanMark()); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  if (!customerId || !CHANNELS.includes(channel)) return { ok: false, msg: 'Bad request.' };
  // balance + aging at time of contact (for the record)
  const { data: invs } = await sb.from('invoices').select('balance, invoice_date').eq('customer_id', customerId).eq('status', 'open');
  let bal = 0, oldest = null;
  (invs || []).forEach((i) => { bal += Number(i.balance) || 0; if (i.invoice_date) { const t = new Date(i.invoice_date).getTime(); if (!Number.isNaN(t) && (oldest == null || t < oldest)) oldest = t; } });
  const days = oldest ? Math.floor((Date.now() - oldest) / 86400000) : null;
  const { error } = await sb.from('collections_log').insert({ customer_id: customerId, channel, direction: 'out', note: note || '', amount: Math.round(bal), aging_bucket: bucketOf(days), by_email: email });
  if (error) return { ok: false, msg: error.message };
  return { ok: true };
}

// A customer's collections timeline (newest first).
export async function getCustomerContacts(customerId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !can(roleOf(user), 'seeFinancials')) return { ok: false, msg: 'Not allowed.' };
  if (!customerId) return { ok: false, msg: 'No customer.' };
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('collections_log').select('id, channel, note, amount, aging_bucket, by_email, created_at').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(50);
  if (error) return { ok: false, msg: error.message, contacts: [] };
  return { ok: true, contacts: data || [] };
}

// ── The accounting bot — watches AR + the ledger, answers accounting questions ──
async function arContext(sb) {
  const days = (t) => (t ? Math.floor((Date.now() - t) / 86400000) : null);
  const byCust = {}; const aging = { cur: 0, d60: 0, d90: 0, d90p: 0 };
  let total = 0, count = 0, from = 0, oldest = null; const now = Date.now();
  while (true) {
    const { data } = await sb.from('invoices').select('balance, invoice_date, customer_id, invoice_number').eq('status', 'open').range(from, from + 999);
    if (!data || !data.length) break;
    data.forEach((i) => {
      const bal = Number(i.balance) || 0; total += bal; count++;
      const cid = i.customer_id || 'none'; const g = byCust[cid] = byCust[cid] || { total: 0, n: 0, oldest: null };
      g.total += bal; g.n++;
      let t = null;
      if (i.invoice_date) { t = new Date(i.invoice_date).getTime(); if (!Number.isNaN(t)) { if (g.oldest == null || t < g.oldest) g.oldest = t; if (oldest == null || t < oldest.t) oldest = { t, cid, inv: i.invoice_number }; } }
      const d = t ? (now - t) / 86400000 : 0;
      if (d > 90) aging.d90p += bal; else if (d > 60) aging.d90 += bal; else if (d > 30) aging.d60 += bal; else aging.cur += bal;
    });
    if (data.length < 1000) break; from += 1000;
  }
  const ranked = Object.entries(byCust).map(([cid, g]) => ({ cid, ...g })).sort((a, b) => b.total - a.total).slice(0, 8);
  const ids = [...new Set([...ranked.map((r) => r.cid), oldest && oldest.cid].filter((x) => x && x !== 'none'))];
  const names = {};
  if (ids.length) { const { data: cs } = await sb.from('customers').select('id, name').in('id', ids); (cs || []).forEach((c) => { names[c.id] = c.name; }); }
  const { data: recent } = await sb.from('ar_activity').select('action, customer_name, amount, by_email, created_at').order('created_at', { ascending: false }).limit(10);

  return {
    arTotalDollars: Math.round(total), openInvoices: count, customersOwing: ranked.length >= 8 ? '8+' : ranked.length,
    aging: { cur: Math.round(aging.cur), d31_60: Math.round(aging.d60), d61_90: Math.round(aging.d90), d90plus: Math.round(aging.d90p) },
    topOwers: ranked.map((r) => ({ customer: names[r.cid] || 'Unknown', owesDollars: Math.round(r.total), invoices: r.n, oldestDaysLate: days(r.oldest) })),
    oldestInvoice: oldest ? { customer: names[oldest.cid] || 'Unknown', invoiceNumber: oldest.inv, daysLate: days(oldest.t) } : null,
    recentCollections: (recent || []).map((a) => ({ what: a.action, customer: a.customer_name, amount: Math.round(Number(a.amount) || 0), by: a.by_email, when: a.created_at })),
  };
}

export async function askAccounting(question) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Not signed in.' };
  const role = roleOf(user);
  if (!can(role, 'seeFinancials')) return { ok: false, msg: 'Your role can’t use the accounting bot.' };
  const q = String(question || '').trim();
  if (!q) return { ok: false, msg: 'Ask a question.' };
  if (!isAiConfigured(role)) return { ok: false, msg: 'No Claude key for your role yet — add ANTHROPIC_KEY_* in Vercel.' };

  const sb = getSupabaseAdmin();
  const ctx = await arContext(sb);
  const anthropic = getAnthropic(role);
  let res;
  try {
    res = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      output_config: { effort: 'low' },
      system:
        'You are the Clog Busterz "Books Bot" — a sharp, no-nonsense accounting assistant watching Accounts Receivable. Answer directly and concisely from the JSON AR snapshot + recent collections ledger. Name names and exact $ (no decimals). Surface who to chase, what got worse, and what was just collected when relevant. If the data does not contain the answer, say what is missing. Under 7 sentences.',
      messages: [{ role: 'user', content: `AR snapshot + recent collections (live):\n${JSON.stringify(ctx)}\n\nQuestion: ${q}` }],
    });
  } catch (e) {
    return { ok: false, msg: 'AI error: ' + (e && e.message ? e.message : String(e)) };
  }
  const answer = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  try {
    await sb.from('ai_usage').insert({ role, screen: 'accounting-bot', model: AI_MODEL, input_tokens: res.usage?.input_tokens || 0, output_tokens: res.usage?.output_tokens || 0, user_email: user.email || '' });
  } catch (_) {}
  return { ok: true, answer: answer || '(no answer)' };
}
