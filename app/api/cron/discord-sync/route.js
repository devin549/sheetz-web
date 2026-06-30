import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { syncDiscordCore } from '@/lib/discordSync';
import { detectRescheduleProposals } from '@/lib/hankActions';
import { runHank } from '@/lib/hank';
import { learnAssetLocations } from '@/lib/assetLearn';
import { detectCommand, resolveItemForChat } from '@/lib/chatIntents';
import { postToDiscord } from '@/lib/discord';
import { createAlert } from '@/lib/alerts';
import { nextSegmentNo } from '@/lib/segments';

// Map a Discord display name → a tech row (by discord_name or name) + their current active job.
async function whoAndJob(sb, fromName) {
  const from = String(fromName || '').trim();
  if (!from) return { tech: null, job: null };
  let tech = null;
  try {
    let q = await sb.from('techs').select('id, name').or(`discord_name.ilike.%${from}%,name.ilike.%${from}%`).limit(1).maybeSingle();
    if (q.error) q = await sb.from('techs').select('id, name').ilike('name', `%${from}%`).limit(1).maybeSingle();
    tech = q.data || null;
  } catch (_) {}
  let job = null;
  if (tech?.id) {
    try { const { data } = await sb.from('jobs').select('id, job_number, job_type, customers(name)').eq('tech_id', tech.id).in('status', ['enroute', 'on_site', 'onsite', 'rolling']).order('scheduled_at', { ascending: true }).limit(1).maybeSingle(); job = data || null; } catch (_) {}
  }
  return { tech, job, name: tech?.name || from };
}

// 🪝 Captain Hook acts on #sheetz chatter: tool-find, running-late, need-help, parts-run. Each new message
// maps to a command → fires the system we already built → posts a confirmation. Deduped by auto:<msgId>.
async function answerChatCommands(sb) {
  const done = { tool: 0, late: 0, help: 0, parts: 0 };
  try {
    const since = new Date(Date.now() - 30 * 60000).toISOString();
    const { data: msgs } = await sb.from('cb_comms').select('id, body, provider_id, from_name').eq('channel', 'discord').eq('direction', 'in').gte('created_at', since).limit(40);
    for (const m of (msgs || [])) {
      if (!m.provider_id) continue;
      const cmd = detectCommand(m.body);
      if (!cmd) continue;
      const replyKey = `auto:${m.provider_id}`;
      const { data: already } = await sb.from('cb_comms').select('id').eq('provider_id', replyKey).maybeSingle();
      if (already) continue;

      let text = '';
      if (cmd.kind === 'tool_request') {
        // Pass job context so size-dependent slang ("cable machine" on a kitchen vs a main) resolves right.
        const wj = await whoAndJob(sb, m.from_name);
        const hit = await resolveItemForChat(sb, cmd.query, { message: m.body, jobType: wj.job?.job_type || '' });
        // Only speak on a HIT. On a miss, stay quiet here and leave the message for Hank — he has crew/van
        // context and can answer naturally ("Kota's got the camera but he's headed to Frankfort") instead of
        // Captain Hook echoing a useless "couldn't locate '<garbled query>'." (Not marking it seen lets Hank take it.)
        if (hit) { text = `🪠 ${hit.kind === 'tool' ? 'Tool' : 'Part'} found — **${hit.name}** is ${hit.locLabel}${hit.qty != null ? ` (qty ${hit.qty})` : ''}.${hit.mapsUrl ? ` 🗺 ${hit.mapsUrl}` : ''}`; done.tool++; }
      } else {
        const { tech, job, name } = await whoAndJob(sb, m.from_name);
        const jobLabel = job?.job_number ? `job ${job.job_number}` : (job?.customers?.name ? job.customers.name : 'their job');
        if (cmd.kind === 'running_late') {
          await createAlert(sb, { kind: 'running_late', entity: 'job', entityId: job?.id || tech?.id, severity: 'high', title: `${name} is running late`, body: `${name} flagged running late in #sheetz on ${jobLabel}. Re-sequence + check the next customer.`, dedupeKey: `chat-late:${m.provider_id}` });
          text = `⏰ Got it ${name} — flagged dispatch${job ? ` on ${jobLabel}` : ''}. We'll watch your next stop.`; done.late++;
        } else if (cmd.kind === 'need_help') {
          await createAlert(sb, { kind: 'no_status', entity: 'job', entityId: job?.id || tech?.id, severity: 'high', title: `${name} needs a hand`, body: `${name} asked for help in #sheetz${job ? ` on ${jobLabel}` : ''}. Send a helper or a 2nd tech.`, dedupeKey: `chat-help:${m.provider_id}` });
          text = `🤝 Dispatch pinged to send help to ${name}${job ? ` on ${jobLabel}` : ''}.`; done.help++;
        } else if (cmd.kind === 'parts_run') {
          if (job?.id) {
            let count = 0; try { const { count: n } = await sb.from('job_segments').select('id', { count: 'exact', head: true }).eq('parent_job_id', job.id); count = n || 0; } catch (_) {}
            try { await sb.from('job_segments').insert({ parent_job_id: job.id, segment_no: nextSegmentNo(job.job_number || '', count), kind: 'parts_run', assigned_tech_id: tech?.id || null, assigned_tech_name: name, reason: `Parts run${cmd.vendor ? ' · ' + cmd.vendor : ''} (from chat)`, status: 'active', started_at: new Date().toISOString(), created_by_name: name }); } catch (_) {}
            text = `🚐 Parts run started on ${jobLabel}${cmd.vendor ? ` (${cmd.vendor})` : ''} — clock's running, drive time attaches to the job.`;
          } else {
            text = `🚐 Noted, ${name} — open the job first and I'll attach the parts-run time to it.`;
          }
          done.parts++;
        }
      }
      if (!text) continue;
      const r = await postToDiscord(text);
      try { await sb.from('cb_comms').insert({ channel: 'discord', direction: 'out', to_addr: '#sheetz', body: text, status: r.ok ? 'sent' : 'failed', from_name: 'Hank', provider_id: replyKey }); } catch (_) {}
      // A keyword command answered this one → mark it Hank-seen so the AI layer (runHank) doesn't double-reply.
      try { await sb.from('cb_comms').update({ hank_seen_at: new Date().toISOString() }).eq('id', m.id); } catch (_) {}
    }
  } catch (_) {}
  return done;
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
  // After pulling new chatter: (1) Hank proposes reschedule actions, (2) keyword commands answer tool/part
  // requests + late/help/parts, (3) Hank fields everything the keywords didn't — conversationally — in this
  // SAME 2-min pass so replies are snappy (was a separate 10-min cron). All best-effort; never block the sync.
  let actions = null, commands = null, hank = null;
  try { actions = await detectRescheduleProposals(sb); } catch (_) {}
  try { commands = await answerChatCommands(sb); } catch (_) {}
  // skipSync: we just synced above. autoPost gated by HANK_AUTOREPLY, same as the standalone hank cron.
  try { const autoPost = String(process.env.HANK_AUTOREPLY || '').toLowerCase() === 'on'; hank = await runHank(sb, { autoPost, skipSync: true }); } catch (_) {}
  // (4) Learn asset locations from #general ("17G dropped at 426 E Broadway") so Hank can answer "where's the X?".
  let assets = null;
  try { assets = await learnAssetLocations(sb); } catch (_) {}
  return NextResponse.json({ ...r, actions, commands, hank, assets }, { status: r.ok ? 200 : 500 });
}
