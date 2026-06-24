// Action-catching: Hank reads #sheetz, spots reschedule requests, and PROPOSES them (never auto-applies).
// A human confirms; then a customer notice is drafted for approval. Server-only.
import { getAnthropic, isAiConfigured, AI_MODEL } from '@/lib/anthropic';

const HANK_ROLE = 'owner';
// Cheap pre-gate so we only spend a Claude call on messages that smell like a reschedule.
const RESCHEDULE_GATE = /\b(reschedul|re-?book|push (it|back|out)|move (the |that )?(job|appt|appointment|call)|bump|come back|push.*\b(week|day)s?\b|\bin (a|\d+) (week|day))/i;

const fmtDate = (d) => { try { return new Date(d).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };

// Find the ONE job a reschedule refers to: by customer name if given, else the sender tech's soonest job.
async function matchJob(sb, { customerName, techName }) {
  const base = 'id, customer_id, customer_name, scheduled_at, tech_name, job_type, status';
  const future = new Date(Date.now() - 86400000).toISOString(); // include today
  try {
    if (customerName) {
      const { data } = await sb.from('jobs').select(base).ilike('customer_name', `%${customerName}%`).gte('scheduled_at', future).order('scheduled_at', { ascending: true }).limit(5);
      const live = (data || []).filter((j) => !/cancel/i.test(String(j.status || '')));
      if (live.length) return live[0];
    }
    if (techName) {
      const { data } = await sb.from('jobs').select(base).ilike('tech_name', `%${techName}%`).gte('scheduled_at', future).order('scheduled_at', { ascending: true }).limit(5);
      const live = (data || []).filter((j) => !/cancel/i.test(String(j.status || '')));
      if (live.length) return live[0];
    }
  } catch (_) {}
  return null;
}

// Scan new inbound messages → propose reschedules. Returns { proposed, scanned }.
export async function detectRescheduleProposals(sb) {
  if (!isAiConfigured(HANK_ROLE)) return { proposed: 0, scanned: 0, err: 'No Claude key.' };
  // Candidates: inbound discord, matches the gate, no proposal yet.
  let msgs = [];
  try {
    const { data } = await sb.from('cb_comms').select('id, from_name, body, created_at').eq('channel', 'discord').eq('direction', 'in').order('created_at', { ascending: false }).limit(40);
    msgs = (data || []).filter((m) => RESCHEDULE_GATE.test(m.body || ''));
  } catch (_) { return { proposed: 0, scanned: 0, err: 'read failed' }; }
  if (!msgs.length) return { proposed: 0, scanned: 0 };

  // Skip ones we've already proposed.
  let already = new Set();
  try { const { data } = await sb.from('comms_actions').select('source_comms_id').in('source_comms_id', msgs.map((m) => m.id)); already = new Set((data || []).map((r) => r.source_comms_id)); } catch (_) {}
  const fresh = msgs.filter((m) => !already.has(m.id));
  if (!fresh.length) return { proposed: 0, scanned: msgs.length };

  // One Claude call to extract structured intent.
  const anthropic = getAnthropic(HANK_ROLE);
  let parsed = [];
  try {
    const res = await anthropic.messages.create({
      model: AI_MODEL, max_tokens: 700, output_config: { effort: 'low' },
      system: 'You extract reschedule requests from a plumbing crew chat. For each message decide if it asks to MOVE/RESCHEDULE a job. Return ONLY JSON: {"items":[{"id":"<id>","isReschedule":true|false,"customerName":"<name or empty>","days":<integer days to push, e.g. "2 weeks"=14, "next week"=7, "a few days"=3, default 7 if unclear>,"reason":"<short reason or empty>"}]}. Only include isReschedule:true items. customerName only if a specific customer/job is named.',
      messages: [{ role: 'user', content: JSON.stringify(fresh.map((m) => ({ id: m.id, from: m.from_name, text: m.body }))) }],
    });
    const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    parsed = (JSON.parse(text.replace(/^```(json)?/i, '').replace(/```$/, '').trim()).items || []).filter((x) => x && x.isReschedule);
  } catch (_) { return { proposed: 0, scanned: fresh.length, err: 'parse failed' }; }

  let proposed = 0;
  for (const it of parsed) {
    const src = fresh.find((m) => m.id === it.id);
    if (!src) continue;
    const days = Math.min(120, Math.max(1, parseInt(it.days, 10) || 7));
    const job = await matchJob(sb, { customerName: it.customerName, techName: src.from_name });
    if (!job || !job.scheduled_at) continue; // can't pin a job → skip (don't guess)
    const oldDate = new Date(job.scheduled_at);
    const newDate = new Date(oldDate.getTime() + days * 86400000);
    const summary = `Move ${job.customer_name || 'the job'}${job.job_type ? ` (${job.job_type})` : ''} ${days === 14 ? '2 weeks' : days === 7 ? '1 week' : `${days} days`} → ${fmtDate(newDate)}${it.reason ? `, reason: ${it.reason}` : ''}. Stays on ${job.tech_name || 'the same tech'}.`;
    try {
      await sb.from('comms_actions').insert({
        source_comms_id: src.id, kind: 'reschedule', job_id: job.id, customer_name: job.customer_name || it.customerName || null,
        tech_name: job.tech_name || src.from_name || null, reason: it.reason || null, days,
        old_date: oldDate.toISOString(), new_date: newDate.toISOString(), summary, created_by: 'hank',
      });
      proposed++;
    } catch (_) {}
  }
  return { proposed, scanned: fresh.length };
}

// The customer-facing draft text for an applied reschedule (queued for approval, never auto-sent).
export function rescheduleDraft({ customerName, jobType, newDate, reason }) {
  const when = fmtDate(newDate);
  const why = reason ? ` to ${reason}` : '';
  return `Hi ${customerName || 'there'}, this is Clog Busterz Plumbing. We need to move your ${jobType || 'appointment'}${why} — the new time is ${when}. Reply here to confirm or pick another time. Thanks!`;
}
