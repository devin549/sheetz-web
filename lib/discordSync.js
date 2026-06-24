// Plain server helper (NOT a 'use server' action file) so both the Messages action and the
// cron route can import it cleanly. Pulls #sheetz chatter into cb_comms, deduped by Discord msg id.
import { fetchDiscordMessages, discordReadConfigured } from '@/lib/discord';

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
