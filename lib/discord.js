// Discord webhook poster — the web-app side of "Captain Hook" (#sheetz team alerts). Server-only.
// Set DISCORD_WEBHOOK_URL in Vercel to your #sheetz webhook. No-ops gracefully if unset.
export const discordConfigured = () => !!process.env.DISCORD_WEBHOOK_URL;

export async function postToDiscord(content) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return { ok: false, error: 'DISCORD_WEBHOOK_URL not set' };
  const body = String(content || '').trim().slice(0, 1900);
  if (!body) return { ok: false, error: 'empty message' };
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: body, username: 'Captain Hook' }),
    });
    if (!r.ok) { const t = await r.text().catch(() => ''); return { ok: false, error: `Discord ${r.status} ${t.slice(0, 100)}` }; }
    return { ok: true };
  } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 120) }; }
}
