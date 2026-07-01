'use server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { sendOne, renderEmailHtml, isEmailConfigured } from '@/lib/email';

const money = (n) => '$' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// 📧 Email the customer their invoice (or, once paid, their PAID invoice). Goes to the email on file + their 2nd
// email + any extra address. The invoice details are IN the email body (no login needed). Used by the tech at
// close and by the office to send a paid invoice after a Net-30 account pays. Gated + best-effort.
export async function sendJobInvoiceEmail(jobId, extraEmail = '') {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!(can(profile.role, 'collectPayment') || can(profile.role, 'changeStatus') || can(profile.role, 'seeFinancials'))) return { ok: false, msg: 'Not allowed.' };
  if (!isEmailConfigured) return { ok: false, msg: 'Email isn’t set up yet (EMAIL_API_KEY in Vercel).' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };

  const { data: job } = await sb.from('jobs').select('id, job_number, customer_id, amount').eq('id', jobId).maybeSingle();
  if (!job) return { ok: false, msg: 'Job not found.' };
  let cust = {};
  if (job.customer_id) {
    try { const { data } = await sb.from('customers').select('name, email, email2').eq('id', job.customer_id).maybeSingle(); cust = data || {}; }
    catch (_) { try { const { data } = await sb.from('customers').select('name, email').eq('id', job.customer_id).maybeSingle(); cust = data || {}; } catch (_2) {} }
  }
  let inv = null; try { const { data } = await sb.from('invoices').select('invoice_number, total, balance, status').eq('job_id', String(jobId)).order('created_at', { ascending: false }).limit(1).maybeSingle(); inv = data || null; } catch (_) {}
  let lines = [], subtotal = 0;
  try { const { data } = await sb.from('pricebook_estimates').select('lines, subtotal, status').eq('job_id', jobId).order('created_at', { ascending: false }).limit(10); const est = (data || []).find((e) => e.status === 'approved') || (data || [])[0]; lines = Array.isArray(est?.lines) ? est.lines : []; subtotal = Number(est?.subtotal) || 0; } catch (_) {}
  const total = Number(inv?.total) || subtotal || Number(job.amount) || 0;
  const balance = inv ? Math.max(0, Number(inv.balance) || 0) : total;
  const paid = Math.max(0, total - balance);
  const isPaid = balance <= 0 && (paid > 0 || inv?.status === 'paid');

  const emails = [...new Set([cust.email, cust.email2, extraEmail].map((e) => String(e || '').trim().toLowerCase()).filter((e) => /.+@.+\..+/.test(e)))];
  if (!emails.length) return { ok: false, msg: 'No email on file for this customer — add one to send.' };

  const first = String(cust.name || 'there').trim().split(/\s+/)[0] || 'there';
  const itemLines = lines.length ? lines.map((l) => `• ${l.name || 'Item'}${Number(l.quantity) > 1 ? ` x${l.quantity}` : ''} — ${money((Number(l.price) || 0) * (Number(l.quantity) || 1))}`).join('\n') : '';
  const invRef = inv?.invoice_number ? ` · #${inv.invoice_number}` : '';
  const subject = `${isPaid ? 'Paid invoice' : 'Your invoice'} — Clog Busterz Plumbing${invRef}`;
  const body = `Hi ${first},\n\n${isPaid ? 'Thank you! Here is your paid invoice' : 'Here is your invoice'}${job.job_number ? ` for job #${job.job_number}` : ''}.\n\n${itemLines ? itemLines + '\n\n' : ''}Subtotal: ${money(subtotal || total)}${paid > 0 ? `\nPaid: ${money(paid)}` : ''}\n${isPaid ? 'Balance: $0.00 — paid in full. We appreciate your business!' : `Balance due: ${money(balance)}`}`;
  const r = await sendOne({ to: emails[0], cc: emails.slice(1).join(',') || undefined, subject, html: renderEmailHtml({ subject, body }), meta: { customerId: job.customer_id, purpose: isPaid ? 'paid_invoice' : 'invoice', ref: inv?.invoice_number || job.job_number || null } });
  if (!r.ok) return { ok: false, msg: r.error || 'Email didn’t send.' };
  try { await sb.from('audit_log').insert({ actor_id: user.id, actor_name: profile.name || user.email, role: profile.role, action: isPaid ? 'invoice.sent_paid' : 'invoice.sent', entity: 'job', entity_id: String(jobId), detail: { to: emails } }); } catch (_) {}
  return { ok: true, msg: `${isPaid ? 'Paid invoice' : 'Invoice'} emailed to ${emails.join(', ')}.` };
}
