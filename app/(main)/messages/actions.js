'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { postToDiscord, fetchMessageReactors } from '@/lib/discord';
import { syncDiscordCore } from '@/lib/discordSync';
import { FIELD_POSITIONS } from '@/lib/positions';
import { requiredNames } from '@/lib/meetings';
import { askHankCore, runHank } from '@/lib/hank';
import { detectRescheduleProposals, rescheduleDraft } from '@/lib/hankActions';
import { sendSms } from '@/lib/twilio';
import { sendOne, isEmailConfigured } from '@/lib/email';
import { revalidatePath } from 'next/cache';

const MANAGE = ['owner', 'admin', 'gm', 'om', 'csr', 'dispatcher', 'marketing', 'sales', 'accounting', 'fs', 'foreman'];
// Only senior roles can wipe a line off the shared feed (audit stays — it's a soft delete).
const DELETE = ['owner', 'admin', 'gm', 'om'];

// Mark the team chat read NOW for the signed-in user — stamps prefs.chat_last_read so the sidebar Chat
// badge/blink clears. Called when the tech opens the chat. Merges into prefs (no migration).
export async function markChatRead() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false };
  try {
    const { data: cur } = await sb.from('profiles').select('prefs').eq('user_id', user.id).maybeSingle();
    const next = { ...((cur && cur.prefs) || {}), chat_last_read: new Date().toISOString() };
    await sb.from('profiles').update({ prefs: next }).eq('user_id', user.id);
  } catch (_) {}
  return { ok: true };
}

async function gate() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await loadProfile(user) : null;
  if (!user || !profile || profile.active === false || !MANAGE.includes(String(profile.role || '').toLowerCase())) return null;
  return { sb: getSupabaseAdmin(), who: profile.name || user.email };
}

// Any active employee (incl. field techs/helpers) — used by Ask Hank, which the whole crew gets in chat.
async function gateAny() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await loadProfile(user) : null;
  if (!user || !profile || profile.active === false) return null;
  return { sb: getSupabaseAdmin(), who: profile.name || user.email };
}

// Broadcast a team message to #sheetz (Discord) — and log it to the comms feed.
export async function postTeamMessage(formData) {
  const g = await gate();
  if (!g) return { ok: false, msg: 'Your role can’t post here.' };
  if (!g.sb) return { ok: false, msg: 'Server not configured.' };
  const text = String(formData.get('text') || '').trim().slice(0, 1500);
  if (!text) return { ok: false, msg: 'Write a message.' };

  const r = await postToDiscord(`💬 ${g.who}: ${text}`);
  try { await g.sb.from('cb_comms').insert({ channel: 'discord', direction: 'out', to_addr: '#sheetz', body: text, status: r.ok ? 'sent' : 'failed', error: r.ok ? null : r.error, sent_by: g.who, from_name: g.who }); } catch (_) {}
  revalidatePath('/messages');
  return r.ok ? { ok: true, msg: 'Posted to #sheetz.' } : { ok: false, msg: 'Discord: ' + r.error };
}

// Tech-side team chat post — ANY active employee (incl. field techs/helpers) can post to #sheetz.
// (Deleting from the shared feed stays senior-only via gate(); posting is open to the whole team.)
export async function postChat(formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await loadProfile(user) : null;
  if (!user || !profile || profile.active === false) return { ok: false, msg: 'Sign in required.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  const who = profile.name || user.email;
  const text = String(formData.get('text') || '').trim().slice(0, 1500);
  if (!text) return { ok: false, msg: 'Write a message.' };
  const r = await postToDiscord(`💬 ${who}: ${text}`);
  try { await sb.from('cb_comms').insert({ channel: 'discord', direction: 'out', to_addr: '#sheetz', body: text, status: r.ok ? 'sent' : 'failed', error: r.ok ? null : r.error, sent_by: who, from_name: who }); } catch (_) {}
  revalidatePath('/messages');
  return r.ok ? { ok: true, msg: 'Posted to the team.' } : { ok: true, msg: 'Posted (Discord offline — saved to the feed).' };
}

// "On it" — a tech acks a personal/office message so the office sees it was caught (closes the loop).
export async function ackChat(fromName) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await loadProfile(user) : null;
  if (!user || !profile || profile.active === false) return { ok: false, msg: 'Sign in required.' };
  const sb = getSupabaseAdmin();
  const who = profile.name || user.email;
  const ref = String(fromName || '').trim().split(/\s+/)[0];
  const text = `✅ ${who} — on it${ref ? ` (@${ref})` : ''}`;
  const r = await postToDiscord(text);
  try { await sb.from('cb_comms').insert({ channel: 'discord', direction: 'out', to_addr: '#sheetz', body: text, status: r.ok ? 'sent' : 'failed', sent_by: who, from_name: who }); } catch (_) {}
  revalidatePath('/messages');
  return { ok: true, msg: 'Marked: on it.' };
}

// Pull #sheetz chatter into the feed (the read-back the webhook alone can't do). Button-triggered;
// the core lives in lib/discordSync so the cron route can share it without crossing the action boundary.
export async function syncDiscordNow() {
  const g = await gate();
  if (!g || !g.sb) return { ok: false, msg: 'Your role can’t do that.' };
  const r = await syncDiscordCore(g.sb);
  let extra = '';
  try { const a = await detectRescheduleProposals(g.sb); if (a.proposed) extra = ` · ${a.proposed} reschedule${a.proposed === 1 ? '' : 's'} to confirm`; } catch (_) {}
  revalidatePath('/messages');
  return { ok: r.ok, msg: r.msg + extra };
}

// Ask Hank directly — answers from live CB data; optionally posts the answer into #sheetz.
export async function askHank(question, postToChannel) {
  const g = await gateAny();
  if (!g || !g.sb) return { ok: false, msg: 'Sign in to ask Hank.' };
  const q = String(question || '').trim();
  if (!q) return { ok: false, msg: 'Ask Hank something.' };
  const r = await askHankCore(g.sb, q, { post: !!postToChannel, askerName: g.who });
  if (postToChannel && r.ok) revalidatePath('/messages');
  return r;
}

// Let Hank read what's new in #sheetz and chime in where he can help (manual trigger of the cron job).
export async function hankReadFeed() {
  const g = await gateAny();
  if (!g || !g.sb) return { ok: false, msg: 'Sign in to use Hank.' };
  const r = await runHank(g.sb, { autoPost: true });
  revalidatePath('/messages');
  return { ok: r.ok, msg: r.msg };
}

// --- Meeting 👍 acknowledgment on a Discord post -----------------------------------------------------
// Infer who's required from the message text: "@everyone" → all field crew; "my team/crew" from a
// supervisor → their managed crew; else everyone.
function inferAudience(body, senderName) {
  if (/@everyone|@here/i.test(body || '')) return 'everyone';
  if (/\bmy (team|crew|guys|people|group)\b/i.test(body || '') && senderName) return `mgr:${senderName}`;
  return 'everyone';
}

async function meetingAckCore(sb, commsId) {
  const { data: m } = await sb.from('cb_comms').select('id, provider_id, from_name, body').eq('id', commsId).maybeSingle();
  if (!m) return { err: 'Message not found.' };
  if (!m.provider_id) return { err: 'No Discord id on this row — can’t read its reactions.' };
  let roster = [];
  try { const { data } = await sb.from('techs').select('name, crew, position, active, supervisor, discord_name, discord_user_id').limit(500); roster = (data || []).filter((t) => t.name); } catch (_) {}
  const field = roster.filter((t) => t.active !== false && (!t.position || FIELD_POSITIONS.includes(String(t.position).toLowerCase().replace(/\s+/g, '_'))));
  const audience = inferAudience(m.body, m.from_name);
  const required = requiredNames(field, audience);
  const rx = await fetchMessageReactors(m.provider_id, '👍');
  if (!rx.ok) return { err: 'Discord: ' + rx.error };
  // Match each reactor to a roster person (by discord_name, then by name).
  const lc = (s) => String(s || '').toLowerCase();
  const reactedNames = new Set();
  rx.users.forEach((u) => {
    const t = field.find((x) => (x.discord_name && (lc(x.discord_name) === lc(u.username) || lc(x.discord_name) === lc(u.name))) || lc(x.name) === lc(u.name) || lc(x.name) === lc(u.username));
    if (t) reactedNames.add(t.name);
  });
  const reacted = required.filter((n) => reactedNames.has(n));
  const missing = required.filter((n) => !reactedNames.has(n));
  return { m, field, audience, required, reacted, missing, reactorCount: rx.users.length };
}

export async function meetingAckStatus(commsId) {
  const g = await gate();
  if (!g || !g.sb) return { ok: false, msg: 'Not allowed.' };
  const r = await meetingAckCore(g.sb, commsId);
  if (r.err) return { ok: false, msg: r.err };
  return { ok: true, audience: r.audience, reacted: r.reacted, missing: r.missing, total: r.required.length, reactorCount: r.reactorCount };
}

// Hank @-mentions everyone who hasn't 👍'd yet (real ping if their discord_user_id is set, else by name).
export async function nudgeMeetingNonResponders(commsId) {
  const g = await gate();
  if (!g || !g.sb) return { ok: false, msg: 'Not allowed.' };
  const r = await meetingAckCore(g.sb, commsId);
  if (r.err) return { ok: false, msg: r.err };
  if (!r.missing.length) return { ok: true, msg: 'Everyone reacted. 🎉' };
  const tags = r.missing.map((n) => { const t = r.field.find((x) => x.name === n); return (t && t.discord_user_id) ? `<@${t.discord_user_id}>` : n; });
  const out = await postToDiscord(`⏰ Still need a 👍 on the meeting: ${tags.join(' ')}`, { users: true });
  return { ok: !!out.ok, msg: out.ok ? `Pinged ${r.missing.length} who haven’t 👍’d.` : `Couldn’t post: ${out.error}` };
}

// Run Hank's action detector (also fires on the discord-sync cron). Proposes reschedules; never applies.
export async function scanActions() {
  const g = await gate();
  if (!g || !g.sb) return { ok: false, msg: 'Not allowed.' };
  const r = await detectRescheduleProposals(g.sb);
  revalidatePath('/messages');
  if (r.err) return { ok: false, msg: 'Hank: ' + r.err };
  return { ok: true, msg: r.proposed ? `Hank proposed ${r.proposed} reschedule${r.proposed === 1 ? '' : 's'}.` : 'No new actions.' };
}

// Confirm a proposed reschedule → move the job (keep the tech) + save the reason. Returns a customer draft.
export async function applyReschedule(actionId) {
  const g = await gate();
  if (!g || !g.sb) return { ok: false, msg: 'Not allowed.' };
  const sb = g.sb;
  const { data: a } = await sb.from('comms_actions').select('*').eq('id', actionId).maybeSingle();
  if (!a) return { ok: false, msg: 'Action not found.' };
  if (a.status !== 'proposed') return { ok: false, msg: `Already ${a.status}.` };
  if (!a.job_id || !a.new_date) return { ok: false, msg: 'Missing job or date.' };
  let job = null;
  try { const { data } = await sb.from('jobs').select('customer_id, job_type, notes, customers(name)').eq('id', a.job_id).maybeSingle(); job = data; } catch (_) {}
  const note = `Rescheduled ${a.days}d${a.reason ? ': ' + a.reason : ''} (per ${a.tech_name || 'crew'}, confirmed by ${g.who})`;
  const payload = { scheduled_at: a.new_date };
  if (job && 'notes' in job) payload.notes = [job.notes, note].filter(Boolean).join(' | ');
  let { error } = await sb.from('jobs').update(payload).eq('id', a.job_id);
  if (error && /notes/.test(error.message || '')) { delete payload.notes; ({ error } = await sb.from('jobs').update(payload).eq('id', a.job_id)); }
  if (error) return { ok: false, msg: 'Could not move the job: ' + error.message };
  await sb.from('comms_actions').update({ status: 'applied', applied_by: g.who, applied_at: new Date().toISOString() }).eq('id', actionId);
  if (a.source_comms_id) { try { await sb.from('cb_comms').update({ resolved_at: new Date().toISOString(), resolved_by: g.who }).eq('id', a.source_comms_id); } catch (_) {} }
  const draft = rescheduleDraft({ customerName: a.customer_name || (job && job.customers && job.customers.name), jobType: job && job.job_type, newDate: a.new_date, reason: a.reason });
  revalidatePath('/messages');
  return { ok: true, msg: 'Job moved — customer notice drafted (not sent).', draft };
}

export async function dismissAction(actionId) {
  const g = await gate();
  if (!g || !g.sb) return { ok: false, msg: 'Not allowed.' };
  try { await g.sb.from('comms_actions').update({ status: 'dismissed', applied_by: g.who, applied_at: new Date().toISOString() }).eq('id', actionId); } catch (_) { return { ok: false, msg: 'Failed.' }; }
  revalidatePath('/messages');
  return { ok: true, msg: 'Dismissed.' };
}

// Approver taps "Send notice" → consent-gated text/email to the customer. NEVER auto-sent.
export async function sendRescheduleNotice(actionId) {
  const g = await gate();
  if (!g || !g.sb) return { ok: false, msg: 'Not allowed.' };
  const sb = g.sb;
  const { data: a } = await sb.from('comms_actions').select('*').eq('id', actionId).maybeSingle();
  if (!a || !a.job_id) return { ok: false, msg: 'Action not found.' };
  const { data: job } = await sb.from('jobs').select('customer_id, job_type, customers(name, phone, phones, email, sms_consent)').eq('id', a.job_id).maybeSingle();
  const c = (job && job.customers) || {};
  const phone = c.phone || (Array.isArray(c.phones) ? c.phones[0] : c.phones) || '';
  const email = c.email || '';
  const body = rescheduleDraft({ customerName: c.name || a.customer_name, jobType: job && job.job_type, newDate: a.new_date, reason: a.reason });
  const bits = [];
  const log = (channel, to, r) => { try { return sb.from('cb_comms').insert({ channel, direction: 'out', to_addr: to, customer_id: job && job.customer_id, job_id: a.job_id, body, status: r.ok ? 'sent' : 'failed', error: r.ok ? null : (r.msg || r.error), sent_by: g.who }); } catch (_) {} };
  if (phone && c.sms_consent) { const r = await sendSms(phone, body); await log('sms', (r && r.to) || phone, r); bits.push(r.ok ? 'text sent' : `text not sent (${r.msg})`); }
  else if (phone) bits.push('no text consent');
  if (email) { const r = isEmailConfigured ? await sendOne({ to: email, subject: 'Appointment update — Clog Busterz Plumbing', html: `<p>${body}</p>` }) : { ok: false, error: 'no email key' }; await log('email', email, r); bits.push(r.ok ? 'email sent' : 'email not sent'); }
  if (!phone && !email) bits.push('no phone/email on file');
  revalidatePath('/messages');
  return { ok: bits.some((b) => b.includes('sent')), msg: bits.join(', ') };
}

// Mini employee card behind a Comms Desk avatar: on/off shift, current job, truck, phone, tools out.
// Everything best-effort + table-missing safe — a missing piece just doesn't show.
export async function employeeCard(name) {
  const g = await gate();
  if (!g || !g.sb) return { ok: false, msg: 'Not allowed.' };
  const who = String(name || '').trim();
  if (!who) return { ok: false, msg: 'No name.' };
  const sb = g.sb;
  const out = { ok: true, name: who };

  // The roster row (match by name or discord_name).
  try {
    const { data } = await sb.from('techs').select('*').or(`name.ilike.${who},discord_name.ilike.${who}`).limit(1);
    const t = (data || [])[0];
    if (t) {
      out.name = t.name || who;
      out.position = t.position || t.role || '';
      out.phone = t.phone || t.cell || '';
      out.photo_url = t.photo_url || '';
      out.truck = t.truck || t.truck_number || t.van || t.truck_id || '';
      out.active = t.active !== false;
    }
  } catch (_) {}

  // Current job today (active status, assigned to them).
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const { data } = await sb.from('jobs').select('address, city, status, job_type, scheduled_at, tech_name, customers(name, address)').gte('scheduled_at', today.toISOString()).ilike('tech_name', `%${out.name}%`).order('scheduled_at', { ascending: true }).limit(20);
    const jobs = data || [];
    const cur = jobs.find((j) => /scheduled|enroute|on_site|on site|dispatched/i.test(String(j.status || '')));
    out.jobsToday = jobs.length;
    if (cur) { const c = cur.customers || {}; out.currentJob = { customer: c.name || 'Job', where: [cur.address || c.address, cur.city].filter(Boolean).join(', '), status: cur.status, type: cur.job_type || '' }; }
  } catch (_) {}

  // Tools checked out to them.
  try {
    const { data } = await sb.from('tools').select('name, serial').ilike('assigned_to', `%${out.name}%`).limit(40);
    out.toolsOut = (data || []).map((t) => t.serial ? `${t.name} (SN ${t.serial})` : t.name);
  } catch (_) {}

  // On/off shift heuristic: a fresh GPS fix or an active job today = on shift.
  try {
    const { data } = await sb.from('tech_locations').select('updated_at').ilike('tech_name', out.name).limit(1);
    const ts = (data || [])[0] && (data || [])[0].updated_at;
    if (ts) out.lastSeenMin = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000));
  } catch (_) {}
  out.onShift = !!out.currentJob || (out.lastSeenMin != null && out.lastSeenMin <= 120);
  return out;
}

// Resolve = "handled, clear it off the desk" (NOT delete). Any signed-in triager can resolve; the row
// stays for the record. Pass done=false to re-open.
export async function resolveMessage(id, done = true) {
  const g = await gate();
  if (!g || !g.sb) return { ok: false, msg: 'Your role can’t triage here.' };
  const upd = done ? { resolved_at: new Date().toISOString(), resolved_by: g.who } : { resolved_at: null, resolved_by: null };
  try { await g.sb.from('cb_comms').update(upd).eq('id', id); } catch (_) { return { ok: false, msg: 'Could not update — run migration 61.' }; }
  revalidatePath('/messages');
  return { ok: true, msg: done ? 'Resolved.' : 'Re-opened.' };
}

// Hide a line from the shared feed (soft delete — the row stays for the audit trail).
export async function deleteMessage(id) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await loadProfile(user) : null;
  if (!user || !profile || profile.active === false || !DELETE.includes(String(profile.role || '').toLowerCase())) return { ok: false, msg: 'Only a manager can clear messages.' };
  const sb = getSupabaseAdmin();
  try { await sb.from('cb_comms').update({ deleted_at: new Date().toISOString(), deleted_by: profile.name || user.email }).eq('id', id); } catch (_) { return { ok: false, msg: 'Could not remove it.' }; }
  revalidatePath('/messages');
  return { ok: true, msg: 'Removed.' };
}
