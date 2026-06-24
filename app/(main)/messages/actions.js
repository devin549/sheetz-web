'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { postToDiscord, fetchDiscordMessages, discordReadConfigured } from '@/lib/discord';
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

// Pull #sheetz chatter back into the feed (the read-back the webhook alone can't do).
// Shared by the "Sync from Discord" button and the cron route. Dedupes by Discord message id.
export async function syncDiscordCore(sb) {
  if (!discordReadConfigured()) return { ok: false, added: 0, msg: 'Add DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID in Vercel.' };
  const f = await fetchDiscordMessages(50);
  if (!f.ok) return { ok: false, added: 0, msg: 'Discord: ' + f.error };
  if (!f.messages.length) return { ok: true, added: 0, msg: 'Nothing new.' };
  const ids = f.messages.map((m) => m.id);
  let existing = new Set();
  try {
    const { data } = await sb.from('cb_comms').select('provider_id').eq('channel', 'discord').eq('direction', 'in').in('provider_id', ids);
    existing = new Set((data || []).map((r) => r.provider_id));
  } catch (_) {}
  const fresh = f.messages.filter((m) => !existing.has(m.id));
  if (!fresh.length) return { ok: true, added: 0, msg: 'Up to date.' };
  const rows = fresh.map((m) => ({ channel: 'discord', direction: 'in', to_addr: '#sheetz', from_name: m.author, body: m.content, status: 'sent', provider_id: m.id, created_at: m.at }));
  let added = 0;
  try { const { error } = await sb.from('cb_comms').insert(rows); if (!error) added = rows.length; } catch (_) {}
  return { ok: true, added, msg: added ? `Pulled ${added} new message${added === 1 ? '' : 's'} from #sheetz.` : 'Up to date.' };
}

export async function syncDiscordNow() {
  const g = await gate();
  if (!g || !g.sb) return { ok: false, msg: 'Your role can’t do that.' };
  const r = await syncDiscordCore(g.sb);
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
