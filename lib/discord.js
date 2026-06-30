// Discord webhook poster — the web-app side of "Captain Hook" (#sheetz team alerts). Server-only.
// Set DISCORD_WEBHOOK_URL in Vercel to your #sheetz (team) webhook. No-ops gracefully if unset.
export const discordConfigured = () => !!process.env.DISCORD_WEBHOOK_URL;

// Operational noise (status pings: en route / lunch / need-a-hand, new jobs, leads, bookings, approvals)
// routes to a SEPARATE office/#dispatch channel so the team #sheetz channel stays human. Set
// DISCORD_OFFICE_WEBHOOK_URL in Vercel; until it exists, office posts fall back to the team webhook
// (nothing breaks, they just keep landing in #sheetz like before).
export const dispatchConfigured = () => !!process.env.DISCORD_OFFICE_WEBHOOK_URL;
function webhookFor(to) {
  const team = process.env.DISCORD_WEBHOOK_URL;
  const office = process.env.DISCORD_OFFICE_WEBHOOK_URL;
  return (to === 'office' || to === 'dispatch') ? (office || team) : team;
}

// opts.to = 'office' → the #dispatch channel (operational); default / 'team' → #sheetz.
// opts.everyone = true → actually ping @everyone (for mandatory alerts like a company meeting).
export async function postToDiscord(content, opts = {}) {
  const url = webhookFor(opts.to);
  if (!url) return { ok: false, error: 'DISCORD_WEBHOOK_URL not set' };
  const body = String(content || '').trim().slice(0, 1900);
  if (!body) return { ok: false, error: 'empty message' };
  // Default: suppress mention pings so a stray "@everyone" in a customer name etc. never blasts the channel.
  // opts.everyone → ping @everyone; opts.users → let <@id> user-mentions actually notify those people.
  const parse = opts.everyone ? ['everyone'] : (opts.users ? ['users'] : []);
  const allowed_mentions = { parse };
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: body, username: opts.username || 'Captain Hook', ...(opts.avatar ? { avatar_url: opts.avatar } : {}), allowed_mentions }),
    });
    if (!r.ok) { const t = await r.text().catch(() => ''); return { ok: false, error: `Discord ${r.status} ${t.slice(0, 100)}` }; }
    return { ok: true };
  } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 120) }; }
}

// Who reacted with a given emoji on a message (for meeting 👍 acknowledgments). Needs the bot.
export async function fetchMessageReactors(messageId, emoji = '👍') {
  const token = process.env.DISCORD_BOT_TOKEN, channel = process.env.DISCORD_CHANNEL_ID;
  if (!token || !channel) return { ok: false, error: 'DISCORD_BOT_TOKEN / DISCORD_CHANNEL_ID not set', users: [] };
  if (!messageId) return { ok: false, error: 'no message id', users: [] };
  try {
    const r = await fetch(`https://discord.com/api/v10/channels/${channel}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}?limit=100`, {
      headers: { Authorization: `Bot ${token}` }, cache: 'no-store',
    });
    if (!r.ok) { const t = await r.text().catch(() => ''); return { ok: false, error: `Discord ${r.status} ${t.slice(0, 100)}`, users: [] }; }
    const raw = await r.json();
    const users = (Array.isArray(raw) ? raw : []).filter((u) => !u.bot).map((u) => ({ id: u.id, username: u.username || '', name: u.global_name || u.username || '' }));
    return { ok: true, users };
  } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 120), users: [] }; }
}

// --- Read side (true two-way) -------------------------------------------------
// A webhook can only POST. To READ #sheetz back into the web feed we need a bot:
// create one at discord.com/developers, invite it to the server, enable the
// "Message Content Intent", then set DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID in Vercel.
export const discordReadConfigured = () => !!(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_CHANNEL_ID);

// Pull the most recent messages from #sheetz. Returns human messages only —
// skips our own Captain Hook webhook posts (they're already logged as outbound).
export async function fetchDiscordMessages(limit = 40) {
  const token = process.env.DISCORD_BOT_TOKEN;
  const channel = process.env.DISCORD_CHANNEL_ID;
  if (!token || !channel) return { ok: false, error: 'DISCORD_BOT_TOKEN / DISCORD_CHANNEL_ID not set', messages: [] };
  try {
    const r = await fetch(`https://discord.com/api/v10/channels/${channel}/messages?limit=${Math.min(100, limit)}`, {
      headers: { Authorization: `Bot ${token}` },
      cache: 'no-store',
    });
    if (!r.ok) { const t = await r.text().catch(() => ''); return { ok: false, error: `Discord ${r.status} ${t.slice(0, 120)}`, messages: [] }; }
    const raw = await r.json();
    const messages = (Array.isArray(raw) ? raw : [])
      .filter((m) => !m.webhook_id && !(m.author && m.author.bot) && ((m.content || '').trim() || (m.attachments || []).length))
      .map((m) => ({
        id: m.id,
        author: (m.author && (m.author.global_name || m.author.username)) || 'Discord',
        authorId: (m.author && m.author.id) || '',
        content: String(m.content || '').slice(0, 1500),
        // Keep image/file attachments as {url, image} so the desk shows thumbnails, not raw card dumps.
        attachments: (Array.isArray(m.attachments) ? m.attachments : []).slice(0, 6).map((a) => ({
          url: a.url, name: a.filename || '', image: /^image\//.test(a.content_type || '') || /\.(png|jpe?g|gif|webp)$/i.test(a.filename || ''),
        })),
        at: m.timestamp,
      }));
    return { ok: true, messages };
  } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 120), messages: [] }; }
}
