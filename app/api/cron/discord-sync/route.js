import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { syncDiscordCore } from '@/lib/discordSync';
import { detectRescheduleProposals } from '@/lib/hankActions';
import { detectToolRequest, resolveItemForChat } from '@/lib/chatIntents';
import { postToDiscord } from '@/lib/discord';

// For each NEW #sheetz message asking for a tool/part, resolve it (P9) and post where it is + a Maps link.
// Deduped: the reply row is stored with provider_id `auto:<msgId>` so we never answer the same ask twice.
async function answerToolRequests(sb) {
  let answered = 0;
  try {
    const since = new Date(Date.now() - 30 * 60000).toISOString();
    const { data: msgs } = await sb.from('cb_comms').select('id, body, provider_id, from_name').eq('channel', 'discord').eq('direction', 'in').gte('created_at', since).limit(40);
    for (const m of (msgs || [])) {
      const intent = detectToolRequest(m.body);
      if (!intent.isRequest || !m.provider_id) continue;
      const replyKey = `auto:${m.provider_id}`;
      const { data: already } = await sb.from('cb_comms').select('id').eq('provider_id', replyKey).maybeSingle();
      if (already) continue;
      const hit = await resolveItemForChat(sb, intent.query);
      const text = hit
        ? `🪠 ${hit.kind === 'tool' ? 'Tool' : 'Part'} found — **${hit.name}** is ${hit.locLabel}${hit.qty != null ? ` (qty ${hit.qty})` : ''}.${hit.mapsUrl ? ` 🗺 ${hit.mapsUrl}` : ''}`
        : `🪠 Couldn't locate "${intent.query}" on a van, shop, or vendor — check the shop counter or add it to inventory.`;
      const r = await postToDiscord(text);
      try { await sb.from('cb_comms').insert({ channel: 'discord', direction: 'out', to_addr: '#sheetz', body: text, status: r.ok ? 'sent' : 'failed', from_name: 'Hank', provider_id: replyKey }); } catch (_) {}
      if (hit) answered++;
    }
  } catch (_) {}
  return answered;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Pulls #sheetz replies into the comms feed on a schedule, so the team doesn't have to hit
// "Sync from Discord" by hand. Secured by CRON_SECRET (Bearer header from Vercel Cron, or ?key=).
function authed(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization') || '';
  const key = new URL(request.url).searchParams.get('key') || '';
  return auth === `Bearer ${secret}` || key === secret;
}

export async function GET(request) {
  if (!authed(request)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'No admin client' }, { status: 500 });
  const r = await syncDiscordCore(sb);
  // After pulling new chatter: (1) Hank proposes reschedule actions, (2) Hank answers tool/part requests
  // with where the item is. Both best-effort — never block the sync.
  let actions = null, toolAnswers = 0;
  try { actions = await detectRescheduleProposals(sb); } catch (_) {}
  try { toolAnswers = await answerToolRequests(sb); } catch (_) {}
  return NextResponse.json({ ...r, actions, toolAnswers }, { status: r.ok ? 200 : 500 });
}
