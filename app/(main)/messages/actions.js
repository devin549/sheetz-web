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
  const r = await askHankCore(g.sb, q, { post: !!postToChannel });
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
