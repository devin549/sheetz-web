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

// Per-customer A/R note (Ashley's Notes column): "Sent to Attorney 4/22", "DO NOT SERVICE", etc.
export async function setArNote(customerId, note) {
  let sb, email;
  try { ({ sb, email } = await assertCanMark()); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  if (!customerId) return { ok: false, msg: 'No customer.' };
  const { error } = await sb.from('ar_notes').upsert(
    { customer_id: customerId, note: String(note || '').slice(0, 500), updated_by: email, updated_at: new Date().toISOString() },
    { onConflict: 'customer_id' });
  if (error) return { ok: false, msg: error.message };
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

// Log a certified-mail send with its USPS tracking number (step 2 of the certified loop).
export async function logCertified(customerId, trackingNumber) {
  let sb, email;
  try { ({ sb, email } = await assertCanMark()); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  if (!customerId) return { ok: false, msg: 'No customer.' };
  const tn = String(trackingNumber || '').trim().slice(0, 40);
  const { data: invs } = await sb.from('invoices').select('balance, invoice_date').eq('customer_id', customerId).eq('status', 'open');
  let bal = 0, oldest = null;
  (invs || []).forEach((i) => { bal += Number(i.balance) || 0; if (i.invoice_date) { const t = new Date(i.invoice_date).getTime(); if (!Number.isNaN(t) && (oldest == null || t < oldest)) oldest = t; } });
  const days = oldest ? Math.floor((Date.now() - oldest) / 86400000) : null;
  const row = { customer_id: customerId, channel: 'certified', direction: 'out', note: tn ? `Certified mail · tracking ${tn}` : 'Certified mail sent', amount: Math.round(bal), aging_bucket: bucketOf(days), by_email: email };
  if (tn) row.tracking_number = tn; // column added in migration 16; only set when present
  const { error } = await sb.from('collections_log').insert(row);
  if (error) return { ok: false, msg: error.message };
  return { ok: true };
}

// Attach a scanned return-receipt (green card) to a certified-mail entry → proof of delivery
// (step 3). Accepts a FormData with logId, file, deliveredAt. Needs migration 16 (bucket + columns).
export async function attachDeliveryProof(formData) {
  let sb;
  try { ({ sb } = await assertCanMark()); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const logId = formData.get('logId');
  const file = formData.get('file');
  const deliveredAt = formData.get('deliveredAt');
  if (!logId || !file || typeof file === 'string' || !file.size) return { ok: false, msg: 'Pick a scan or photo of the receipt.' };
  if (file.size > 8 * 1024 * 1024) return { ok: false, msg: 'File too big (max 8MB).' };

  const { data: rowc } = await sb.from('collections_log').select('customer_id').eq('id', logId).maybeSingle();
  if (!rowc) return { ok: false, msg: 'Timeline entry not found.' };

  const safe = String(file.name || 'receipt').replace(/[^\w.\-]/g, '_').slice(0, 60);
  const path = `${rowc.customer_id}/${logId}-${safe}`;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await sb.storage.from('collections-evidence').upload(path, buf, { contentType: file.type || 'application/octet-stream', upsert: true });
    if (upErr) return { ok: false, msg: 'Upload failed: ' + upErr.message + ' (run migration 16 first?)' };
  } catch (e) { return { ok: false, msg: 'Upload error: ' + ((e && e.message) || e) }; }

  const patch = { proof_path: path };
  if (deliveredAt) patch.delivered_at = deliveredAt;
  const { error } = await sb.from('collections_log').update(patch).eq('id', logId);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/past-due');
  return { ok: true };
}

// A customer's full collections timeline (newest first) — logged contact attempts MERGED with Pete
// AI calls (recordings + outcomes) + certified-mail tracking/delivery proof. select('*') keeps this
// safe before migrations 15/16 add their columns.
export async function getCustomerContacts(customerId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !can(roleOf(user), 'seeFinancials')) return { ok: false, msg: 'Not allowed.' };
  if (!customerId) return { ok: false, msg: 'No customer.' };
  const sb = getSupabaseAdmin();
  const [logRes, callRes, mailRes] = await Promise.all([
    sb.from('collections_log').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(50),
    sb.from('pete_calls').select('id, status, summary, recording_url, duration_s, ended_reason, requested_by, approved_by, created_at').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(50),
    // campaign emails WE sent (tracked) — surfaces "they're getting it / opened it". Cols exist after mig 14/18.
    sb.from('email_sends').select('id, status, sent_at, opened_at, open_count, created_at, campaign_id').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(50),
  ]);
  if (logRes.error) return { ok: false, msg: logRes.error.message, contacts: [] };

  // subject lines for the sent emails (best-effort)
  const subjById = {};
  const campIds = [...new Set((mailRes.data || []).map((m) => m.campaign_id).filter(Boolean))];
  if (campIds.length) { try { const { data: camps } = await sb.from('email_campaigns').select('id, subject').in('id', campIds); (camps || []).forEach((c) => { subjById[c.id] = c.subject; }); } catch (_) {} }

  const logs = logRes.data || [];
  // sign any delivery-receipt scans for viewing (1h URLs)
  for (const l of logs) {
    if (l.proof_path) { try { const { data } = await sb.storage.from('collections-evidence').createSignedUrl(l.proof_path, 3600); l._proofUrl = (data && data.signedUrl) || ''; } catch (_) {} }
  }

  const items = [];
  logs.forEach((l) => items.push({
    id: 'l' + l.id, rawId: l.id, kind: 'log', channel: l.channel, note: l.note || '', by_email: l.by_email, created_at: l.created_at,
    tracking_number: l.tracking_number || '', delivered_at: l.delivered_at || null, proof_url: l._proofUrl || '',
  }));
  // pete_calls may not exist yet (migration 15) — callRes.data is null then, handled.
  (callRes.data || []).forEach((c) => items.push({
    id: 'c' + c.id, kind: 'call', channel: 'call', status: c.status, note: c.summary || '',
    recording_url: c.recording_url || '', duration_s: c.duration_s || null, ended_reason: c.ended_reason || '',
    by_email: c.approved_by || c.requested_by || '', created_at: c.created_at,
  }));
  // tracked campaign emails (mig 14/18) — show sent + open status so we know they're getting it.
  (mailRes.data || []).filter((m) => ['sent', 'failed'].includes(m.status)).forEach((m) => items.push({
    id: 'm' + m.id, kind: 'email', channel: 'email', status: m.status, note: subjById[m.campaign_id] || '',
    opened_at: m.opened_at || null, open_count: m.open_count || 0, created_at: m.sent_at || m.created_at,
  }));
  items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return { ok: true, contacts: items };
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
