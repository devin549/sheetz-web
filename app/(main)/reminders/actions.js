'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { sendSms } from '@/lib/twilio';
import { sendOne, isEmailConfigured, esc } from '@/lib/email';
import { revalidatePath } from 'next/cache';

const VIEW = ['owner', 'admin', 'gm', 'om', 'csr', 'dispatcher', 'marketing', 'sales'];

async function gate() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await loadProfile(user) : null;
  if (!user || !profile || profile.active === false || !VIEW.includes(String(profile.role || '').toLowerCase())) return null;
  return { sb: getSupabaseAdmin(), who: profile.name || user.email };
}
const first = (c) => (c && (c.phone || (Array.isArray(c.phones) ? c.phones[0] : c.phones))) || '';

// Send an appointment reminder (text + email) — HUMAN-clicked, consent-gated, logged. Never auto-fires.
export async function sendReminder(jobId) {
  const g = await gate();
  if (!g) return { ok: false, msg: 'Your role can’t send reminders.' };
  if (!g.sb) return { ok: false, msg: 'Server not configured.' };
  const { data: job } = await g.sb.from('jobs').select('id, job_type, scheduled_at, customer_id, customers(name, phone, phones, email, sms_consent)').eq('id', jobId).maybeSingle();
  if (!job) return { ok: false, msg: 'Job not found.' };
  const c = job.customers || {};
  const whenStr = job.scheduled_at ? new Date(job.scheduled_at).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'soon';
  const phone = first(c), email = c.email || '';
  const bits = [];
  const log = (channel, to, body, r) => { try { return g.sb.from('cb_comms').insert({ channel, to_addr: to, customer_id: job.customer_id, job_id: job.id, body, status: r.ok ? 'sent' : 'failed', provider_id: r.sid || null, error: r.ok ? null : (r.msg || r.error), sent_by: g.who }); } catch (_) {} };

  if (phone && c.sms_consent) {
    const body = `Clog Busterz reminder: your ${job.job_type || 'appointment'} is ${whenStr}. Reply to reschedule. STOP to opt out.`;
    const r = await sendSms(phone, body); await log('sms', (r && r.to) || phone, body, r);
    bits.push(r.ok ? 'text sent' : `text not sent (${r.msg})`);
  } else if (phone) bits.push('no text consent');
  if (email) {
    const subject = 'Appointment reminder — Clog Busterz Plumbing';
    const html = `<!doctype html><html><body style="font-family:Arial,sans-serif"><p>Hi ${esc(c.name || 'there')},</p><p>Reminder: your <strong>${esc(job.job_type || 'appointment')}</strong> with Clog Busterz Plumbing is <strong>${esc(whenStr)}</strong>.</p><p>Reply to this email to reschedule.</p></body></html>`;
    const r = isEmailConfigured ? await sendOne({ to: email, subject, html }) : { ok: false, error: 'no email key' };
    await log('email', email, subject, r);
    bits.push(r.ok ? 'email sent' : 'email not sent');
  }
  if (!phone && !email) bits.push('no phone/email on file');
  revalidatePath('/reminders');
  return { ok: bits.some((b) => b.includes('sent')), msg: bits.join(', ') };
}
