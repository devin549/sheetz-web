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
  const rows = fresh.map((m) => ({ channel: 'discord', direction: 'in', to_addr: '#sheetz', from_name: m.author, body: m.content, status: 'sent', provider_id: m.id, created_at: m.at, attachments: (m.attachments && m.attachments.length) ? m.attachments : null }));
  let err = null;
  try { const { error } = await sb.from('cb_comms').insert(rows); err = error; } catch (e) { err = e; }
  // attachments is new (migration 61) — if the column isn't there yet, retry without it.
  if (err && /attachments/.test(String(err.message || err))) {
    const lite = rows.map(({ attachments, ...r }) => r);
    try { const { error } = await sb.from('cb_comms').insert(lite); err = error; } catch (e) { err = e; }
  }
  if (err) {
    // Most common cause: migration 56 (the from_name column) hasn't been run yet.
    const m = String((err && err.message) || err);
    const hint = /from_name|column/i.test(m) ? 'run supabase/56 (the from_name column is missing)' : m.slice(0, 140);
    return { ok: false, added: 0, msg: `Found ${fresh.length} but couldn’t save — ${hint}.` };
  }
  return { ok: true, added: rows.length, msg: `Pulled ${rows.length} new message${rows.length === 1 ? '' : 's'} from #sheetz.` };
}
