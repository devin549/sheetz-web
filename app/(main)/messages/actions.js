'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { postToDiscord } from '@/lib/discord';
import { syncDiscordCore } from '@/lib/discordSync';
import { askHankCore, runHank } from '@/lib/hank';
import { revalidatePath } from 'next/cache';

const MANAGE = ['owner', 'admin', 'gm', 'om', 'csr', 'dispatcher', 'marketing', 'sales', 'accounting', 'fs', 'foreman'];
// Only senior roles can wipe a line off the shared feed (audit stays — it's a soft delete).
const DELETE = ['owner', 'admin', 'gm', 'om'];

async function gate() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await loadProfile(user) : null;
  if (!user || !profile || profile.active === false || !MANAGE.includes(String(profile.role || '').toLowerCase())) return null;
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

// Pull #sheetz chatter into the feed (the read-back the webhook alone can't do). Button-triggered;
// the core lives in lib/discordSync so the cron route can share it without crossing the action boundary.
export async function syncDiscordNow() {
  const g = await gate();
  if (!g || !g.sb) return { ok: false, msg: 'Your role can’t do that.' };
  const r = await syncDiscordCore(g.sb);
  revalidatePath('/messages');
  return { ok: r.ok, msg: r.msg };
}

// Ask Hank directly — answers from live CB data; optionally posts the answer into #sheetz.
export async function askHank(question, postToChannel) {
  const g = await gate();
  if (!g || !g.sb) return { ok: false, msg: 'Your role can’t use Hank.' };
  const q = String(question || '').trim();
  if (!q) return { ok: false, msg: 'Ask Hank something.' };
  const r = await askHankCore(g.sb, q, { post: !!postToChannel, askerName: g.who });
  if (postToChannel && r.ok) revalidatePath('/messages');
  return r;
}

// Let Hank read what's new in #sheetz and chime in where he can help (manual trigger of the cron job).
export async function hankReadFeed() {
  const g = await gate();
  if (!g || !g.sb) return { ok: false, msg: 'Your role can’t do that.' };
  const r = await runHank(g.sb, { autoPost: true });
  revalidatePath('/messages');
  return { ok: r.ok, msg: r.msg };
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
    const { data } = await sb.from('jobs').select('customer_name, address, city, status, job_type, scheduled_at, tech_name').gte('scheduled_at', today.toISOString()).ilike('tech_name', `%${out.name}%`).order('scheduled_at', { ascending: true }).limit(20);
    const jobs = data || [];
    const cur = jobs.find((j) => /scheduled|enroute|on_site|on site|dispatched/i.test(String(j.status || '')));
    out.jobsToday = jobs.length;
    if (cur) out.currentJob = { customer: cur.customer_name || 'Job', where: [cur.address, cur.city].filter(Boolean).join(', '), status: cur.status, type: cur.job_type || '' };
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
