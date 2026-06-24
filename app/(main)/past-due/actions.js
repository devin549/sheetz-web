'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { getAnthropic, isAiConfigured, AI_MODEL } from '@/lib/anthropic';
import { isEmailConfigured, sendOne, appBaseUrl } from '@/lib/email';
import { createInvoiceCheckout, isStripeConfigured } from '@/lib/stripe';
import { COMPANY } from '@/lib/company';
import { revalidatePath } from 'next/cache';

const fmtUsd = (n) => '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function renderStatementHtml({ name, list, total }) {
  const rows = list.map((i) => `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">${i.date || ''}</td><td style="padding:4px 8px;border-bottom:1px solid #eee">#${i.num || ''}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${fmtUsd(i.bal)}</td></tr>`).join('');
  const base = appBaseUrl();
  const logo = (base && COMPANY.logo) ? `<img src="${base}${COMPANY.logo}" alt="${COMPANY.name}" height="34" style="height:34px;width:auto;vertical-align:middle;margin-right:10px" />` : '';
  return `<!doctype html><html><body style="margin:0;background:#f4f3ef;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
  <div style="max-width:600px;margin:0 auto;padding:24px"><div style="background:#fff;border:1px solid #e3e0d8;border-radius:10px;overflow:hidden">
    <div style="background:#fff;color:#1a1a1a;padding:14px 20px;font-weight:800;font-size:16px;border-bottom:3px solid #FF6B00">${logo}${COMPANY.name}</div>
    <div style="padding:22px 20px;font-size:14px">
      <p>Hi ${name || 'there'},</p>
      <p>Here is your current statement of account. Your balance due is <strong>${fmtUsd(total)}</strong> across ${list.length} open invoice${list.length === 1 ? '' : 's'}.</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin:10px 0">
        <thead><tr><th style="text-align:left;padding:4px 8px;border-bottom:2px solid #ccc">Date</th><th style="text-align:left;padding:4px 8px;border-bottom:2px solid #ccc">Invoice</th><th style="text-align:right;padding:4px 8px;border-bottom:2px solid #ccc">Amount</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="2" style="padding:6px 8px;font-weight:800;border-top:2px solid #ccc">Total due</td><td style="padding:6px 8px;text-align:right;font-weight:800;border-top:2px solid #ccc">${fmtUsd(total)}</td></tr></tfoot>
      </table>
      <p>Questions or want to set up a payment plan? Call us at <strong>${COMPANY.phone}</strong> or just reply to this email.</p>
      <p>Thank you,<br>${COMPANY.name}</p>
    </div>
    <div style="padding:14px 20px;border-top:1px solid #eee;font-size:11px;color:#888">${COMPANY.name} · ${COMPANY.phone} · ${COMPANY.email}</div>
  </div></div></body></html>`;
}

// Email a customer their statement (1:1 office send — gated to financial seats, logged to the
// timeline + ledger). Uses your EMAIL_FROM (e.g. billing@clogbusterzplumbing.com).
export async function emailStatement(customerId) {
  let sb, email;
  try { ({ sb, email } = await assertCanMark()); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  if (!customerId) return { ok: false, msg: 'No customer.' };
  if (!isEmailConfigured) return { ok: false, msg: 'Add EMAIL_API_KEY (Resend) + EMAIL_FROM in Vercel to email statements.' };
  const { data: cust } = await sb.from('customers').select('name, email').eq('id', customerId).maybeSingle();
  if (!cust) return { ok: false, msg: 'Customer not found.' };
  if (!cust.email) return { ok: false, msg: 'This customer has no email on file.' };
  const { data: invs } = await sb.from('invoices').select('invoice_number, invoice_date, balance').eq('customer_id', customerId).eq('status', 'open');
  const list = (invs || []).map((i) => ({ num: i.invoice_number, date: i.invoice_date, bal: Number(i.balance) || 0 })).sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
  const total = list.reduce((a, i) => a + i.bal, 0);
  const r = await sendOne({ to: cust.email, subject: `Statement of Account — ${COMPANY.name} — ${fmtUsd(total)} due`, html: renderStatementHtml({ name: cust.name, list, total }) });
  if (!r.ok) return { ok: false, msg: r.error };
  try { await sb.from('collections_log').insert({ customer_id: customerId, channel: 'email', direction: 'out', note: `Statement emailed (${fmtUsd(total)})`, amount: Math.round(total), by_email: email }); } catch (_) {}
  try { await sb.from('ar_activity').insert({ action: 'statement_emailed', customer_id: customerId, customer_name: cust.name, amount: Math.round(total), by_email: email }); } catch (_) {}
  revalidatePath('/past-due');
  return { ok: true, msg: `✅ Statement emailed to ${cust.email}.` };
}

// Only financial seats (owner/accounting/gm) may mark AR paid — never read-only viewer.
async function assertCanMark() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Your role can’t mark invoices paid.');
  const profile = await loadProfile(user);
  const role = profile.role;
  if (profile.active === false || !can(role, 'seeFinancials') || role === 'viewer') throw new Error('Your role can’t mark invoices paid.');
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Server not configured.');
  return { sb, email: user.email || '', role };
}

async function custName(sb, customerId) {
  if (!customerId) return '';
  const { data } = await sb.from('customers').select('name').eq('id', customerId).maybeSingle();
  return (data && data.name) || '';
}

// Create a Stripe pay link for a customer's collectible balance → office texts/emails it; the webhook
// marks the invoice(s) paid when they pay. No card data touches us.
export async function createPayLink(customerId, amountDollars, customerName) {
  let sb;
  try { ({ sb } = await assertCanMark()); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  if (!isStripeConfigured()) return { ok: false, msg: 'Add STRIPE_SECRET_KEY in Vercel (use a sk_test_… key first).' };
  const cents = Math.round((Number(amountDollars) || 0) * 100);
  if (cents < 50) return { ok: false, msg: 'Nothing collectible to bill.' };
  const name = customerName || (await custName(sb, customerId));
  // If it's a single open invoice, tag it so the webhook can mark that exact one paid.
  let invoiceId = null, invoiceNumber = null;
  try {
    const { data } = await sb.from('invoices').select('id, invoice_number').eq('customer_id', customerId).eq('status', 'open').limit(2);
    if (data && data.length === 1) { invoiceId = data[0].id; invoiceNumber = data[0].invoice_number; }
  } catch (_) {}
  const r = await createInvoiceCheckout({ amountCents: cents, invoiceNumber, customerName: name, invoiceId, customerId });
  if (!r.ok) return { ok: false, msg: 'Stripe: ' + r.error };
  // Log that a pay link was generated (audit trail).
  try { await sb.from('ar_activity').insert({ action: 'pay_link_created', customer_id: customerId || null, customer_name: name || null, invoice_number: invoiceNumber, amount: cents / 100, by_email: 'paylink' }); } catch (_) {}
  return { ok: true, url: r.url };
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

// ── Customer search + merge (clean up import duplicates like "On Course" / "Oncourse") ──
export async function searchCustomers(q) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const prof = user ? await loadProfile(user) : null;
  if (!user || !prof || prof.active === false || !can(prof.role, 'seeFinancials')) return { ok: false, msg: 'Not allowed.' };
  const needle = String(q || '').trim();
  if (needle.length < 2) return { ok: true, results: [] };
  const sb = getSupabaseAdmin();
  const { data } = await sb.from('customers').select('id, name, cb_number').ilike('name', `%${needle}%`).limit(12);
  return { ok: true, results: data || [] };
}

// Merge a DUPLICATE customer into a KEEPER: moves invoices/notes/timeline/calls/jobs onto the
// keeper, then removes the duplicate. Gated to financial seats.
export async function mergeCustomers(keepId, dupeId) {
  let sb, email;
  try { ({ sb, email } = await assertCanMark()); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  if (!keepId || !dupeId) return { ok: false, msg: 'Pick both customers.' };
  if (keepId === dupeId) return { ok: false, msg: 'Pick two different customers.' };
  const { data: keep } = await sb.from('customers').select('name').eq('id', keepId).maybeSingle();
  const { data: dupe } = await sb.from('customers').select('name').eq('id', dupeId).maybeSingle();
  if (!keep || !dupe) return { ok: false, msg: 'Customer not found.' };

  const moved = {};
  const reassign = async (table) => {
    try { const { data } = await sb.from(table).update({ customer_id: keepId }).eq('customer_id', dupeId).select('id'); moved[table] = (data || []).length; }
    catch (_) { /* table may not exist yet — skip */ }
  };
  for (const t of ['invoices', 'collections_log', 'pete_calls', 'email_sends', 'ar_activity', 'jobs']) await reassign(t);

  // ar_notes is keyed by customer_id (one per customer) — combine the text, then drop the dupe row.
  try {
    const { data: dn } = await sb.from('ar_notes').select('note').eq('customer_id', dupeId).maybeSingle();
    if (dn?.note) {
      const { data: kn } = await sb.from('ar_notes').select('note').eq('customer_id', keepId).maybeSingle();
      const combined = [kn?.note, dn.note].filter(Boolean).join(' · ').slice(0, 500);
      await sb.from('ar_notes').upsert({ customer_id: keepId, note: combined, updated_by: email, updated_at: new Date().toISOString() }, { onConflict: 'customer_id' });
    }
    await sb.from('ar_notes').delete().eq('customer_id', dupeId);
  } catch (_) {}

  const { error } = await sb.from('customers').delete().eq('id', dupeId);
  if (error) return { ok: false, msg: 'Moved the records, but couldn’t remove the duplicate: ' + error.message };

  try { await sb.from('ar_activity').insert({ action: 'customers_merged', customer_id: keepId, customer_name: keep.name, invoice_number: `merged: ${dupe.name}`, by_email: email }); } catch (_) {}
  revalidatePath('/past-due');
  return { ok: true, keep: keep.name, dupe: dupe.name, moved };
}

// ── AR import (CSV/paste from a ServiceTitan export → real customers + open invoices) ──
// Non-exported helpers (a 'use server' file may only EXPORT async fns; module consts are fine).
function parseCsv(text) {
  const s = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = []; let row = []; let field = ''; let inQ = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) { if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += ch; continue; }
    if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch === '\t' && !field && !row.length) { /* tolerate leading tab */ }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}
function detectCols(headers) {
  const h = headers.map((x) => String(x).toLowerCase().trim());
  const find = (...keys) => {
    for (const k of keys) { const i = h.findIndex((x) => x === k); if (i >= 0) return i; }
    for (const k of keys) { const i = h.findIndex((x) => x.includes(k)); if (i >= 0) return i; }
    return -1;
  };
  return {
    customer: find('customer name', 'customer', 'name', 'client', 'account'),
    invoice: find('invoice #', 'invoice number', 'invoice', 'inv #', 'doc #', 'inv'),
    date: find('invoice date', 'inv date', 'date'),
    balance: find('total due', 'balance', 'open balance', 'amount due', 'amount', 'total'),
    city: find('service location', 'job site', 'city', 'location'),
    phone: find('phone number', 'phone'),
    email: find('e-mail', 'email'),
    address: find('address', 'street', 'bill to'),
  };
}
const parseMoney = (v) => Number(String(v == null ? '' : v).replace(/[$,()\s]/g, '')) || 0;
function isoDate(v) { const s = String(v || '').trim(); if (!s) return null; const t = new Date(s); return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10); }

// PREVIEW — detect columns + counts, no writes.
export async function previewImport(csv) {
  try { await assertCanMark(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const rows = parseCsv(csv);
  if (rows.length < 2) return { ok: false, msg: 'Need a header row + at least one data row.' };
  const cols = detectCols(rows[0]);
  if (cols.customer < 0 || cols.balance < 0) return { ok: false, msg: 'Couldn’t find a Customer and a Balance/Amount column. Headers seen: ' + rows[0].join(' | ') };
  const data = rows.slice(1);
  const names = new Set(data.map((r) => String(r[cols.customer] || '').trim()).filter(Boolean));
  const sample = data.slice(0, 6).map((r) => ({ customer: String(r[cols.customer] || '').trim(), invoice: cols.invoice >= 0 ? String(r[cols.invoice] || '').trim() : '', date: cols.date >= 0 ? isoDate(r[cols.date]) : null, balance: parseMoney(r[cols.balance]) }));
  const mapped = Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, v >= 0 ? rows[0][v] : null]));
  return { ok: true, rows: data.length, customers: names.size, cols: mapped, sample };
}

// RUN — create/find customers by name + insert open invoices (skips dupe invoice #s).
export async function runImport(csv) {
  let sb; try { ({ sb } = await assertCanMark()); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const rows = parseCsv(csv);
  if (rows.length < 2) return { ok: false, msg: 'Nothing to import.' };
  const cols = detectCols(rows[0]);
  if (cols.customer < 0 || cols.balance < 0) return { ok: false, msg: 'Missing a Customer / Balance column.' };
  const data = rows.slice(1);

  const names = [...new Set(data.map((r) => String(r[cols.customer] || '').trim()).filter(Boolean))];
  const nameToId = {};
  for (let i = 0; i < names.length; i += 200) {
    const { data: cs } = await sb.from('customers').select('id, name').in('name', names.slice(i, i + 200));
    (cs || []).forEach((c) => { if (c.name) nameToId[c.name.toLowerCase()] = c.id; });
  }
  let custCreated = 0;
  for (const n of names) {
    if (nameToId[n.toLowerCase()]) continue;
    const r = data.find((rr) => String(rr[cols.customer] || '').trim() === n) || [];
    const ins = { name: n };
    if (cols.phone >= 0 && r[cols.phone]) ins.phone = String(r[cols.phone]).trim();
    if (cols.email >= 0 && r[cols.email]) ins.email = String(r[cols.email]).trim();
    if (cols.address >= 0 && r[cols.address]) ins.address = String(r[cols.address]).trim();
    const { data: created, error } = await sb.from('customers').insert(ins).select('id').single();
    if (!error && created) { nameToId[n.toLowerCase()] = created.id; custCreated++; }
  }

  const invNums = [...new Set((cols.invoice >= 0 ? data.map((r) => String(r[cols.invoice] || '').trim()) : []).filter(Boolean))];
  const existing = new Set();
  for (let i = 0; i < invNums.length; i += 300) {
    const { data: ex } = await sb.from('invoices').select('invoice_number').in('invoice_number', invNums.slice(i, i + 300));
    (ex || []).forEach((e) => existing.add(String(e.invoice_number)));
  }

  const toInsert = []; let skipped = 0;
  for (const r of data) {
    const name = String(r[cols.customer] || '').trim();
    const cid = name && nameToId[name.toLowerCase()];
    if (!cid) { skipped++; continue; }
    const invNum = cols.invoice >= 0 ? String(r[cols.invoice] || '').trim() : '';
    if (invNum && existing.has(invNum)) { skipped++; continue; }
    const bal = parseMoney(r[cols.balance]);
    if (!bal) { skipped++; continue; }
    toInsert.push({ customer_id: cid, invoice_number: invNum || null, invoice_date: cols.date >= 0 ? isoDate(r[cols.date]) : null, balance: bal, city: cols.city >= 0 ? String(r[cols.city] || '').trim() : null, status: 'open' });
    if (invNum) existing.add(invNum);
  }
  let invCreated = 0;
  for (let i = 0; i < toInsert.length; i += 500) {
    const { error } = await sb.from('invoices').insert(toInsert.slice(i, i + 500));
    if (!error) invCreated += toInsert.slice(i, i + 500).length;
  }

  revalidatePath('/past-due');
  return { ok: true, custCreated, invCreated, skipped, customersSeen: names.length };
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

// Mark an invoice DOUBTFUL (bad debt) → drops out of collectible AR but stays owed (still on the
// statement + lawyer packet). Toggle off to restore. Logs to the ledger.
export async function setInvoiceDoubtful(invoiceId, on) {
  let sb, email;
  try { ({ sb, email } = await assertCanMark()); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  if (!invoiceId) return { ok: false, msg: 'No invoice.' };
  const { data: inv } = await sb.from('invoices').select('balance, customer_id, invoice_number').eq('id', invoiceId).maybeSingle();
  const patch = on ? { doubtful: true, doubtful_at: new Date().toISOString(), doubtful_by: email } : { doubtful: false, doubtful_at: null, doubtful_by: null };
  const { error } = await sb.from('invoices').update(patch).eq('id', invoiceId);
  if (error) return { ok: false, msg: error.message };
  try { await sb.from('ar_activity').insert({ action: on ? 'marked_doubtful' : 'restored_collectible', customer_id: inv?.customer_id || null, customer_name: await custName(sb, inv?.customer_id), invoice_id: invoiceId, invoice_number: inv?.invoice_number || '', amount: Number(inv?.balance) || 0, by_email: email }); } catch (_) {}
  revalidatePath('/past-due');
  return { ok: true };
}

// Mark/restore a whole customer's open balance doubtful.
export async function markCustomerDoubtful(customerId, on) {
  let sb, email;
  try { ({ sb, email } = await assertCanMark()); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  if (!customerId) return { ok: false, msg: 'No customer.' };
  const patch = on ? { doubtful: true, doubtful_at: new Date().toISOString(), doubtful_by: email } : { doubtful: false, doubtful_at: null, doubtful_by: null };
  const { error } = await sb.from('invoices').update(patch).eq('customer_id', customerId).eq('status', 'open');
  if (error) return { ok: false, msg: error.message };
  try { await sb.from('ar_activity').insert({ action: on ? 'customer_doubtful' : 'customer_restored', customer_id: customerId, customer_name: await custName(sb, customerId), by_email: email }); } catch (_) {}
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
  const prof = user ? await loadProfile(user) : null;
  if (!user || !prof || prof.active === false || !can(prof.role, 'seeFinancials')) return { ok: false, msg: 'Not allowed.' };
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
  const profile = await loadProfile(user);
  const role = profile.role;
  if (profile.active === false || !can(role, 'seeFinancials')) return { ok: false, msg: 'Your role can’t use the accounting bot.' };
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
