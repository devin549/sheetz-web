// AI race-lane roast — generates ONE line in Mr. Corn (🌽 hype) + Golden Turd (💩 heel) voice, pulling
// flavor from Devin's two Anthropic Files. Scoreboard-only, HR-safe (same rule as lib/roast). Returns
// the text, or null on ANY failure so the caller falls back to the lib/laneRoast template. SERVER-ONLY.
import { getAnthropic, AI_MODEL } from '@/lib/anthropic';

// The roast corpus files in Devin's Anthropic "default" workspace (Mr. Corn + Golden Turd).
const ROAST_FILES = ['file_011Cb2cPcnVarco4zpGTPXXv', 'file_011Cb2c3U44nRJ6nafXtS3vA'];
const FILES_BETA = 'files-api-2025-04-14';

export async function generateAiRoast({ role = 'tech', name, race = 'revenue', rank = 0, total = 1, level = 'PG-13', hhwp = false, stats = '' }) {
  const client = getAnthropic(role);
  if (!client) return null;
  const r = Number(rank) || 0, n = Number(total) || 1;
  const tier = r === 1 ? 'leading the board' : r <= 3 ? 'top 3' : (n > 1 && r === n) ? 'dead last' : 'mid-pack';
  const voice = r === 1 ? 'Mr. Corn (the hype-man — celebrate but push for more)'
    : (n > 1 && r === n) ? 'Golden Turd (the heel — let them have it, but scoreboard only)'
      : 'Mr. Corn + Golden Turd tag-team';
  const heat = level === 'R' ? 'no mercy (still clean)' : level === 'PG-13' ? 'some bite' : 'clean ribbing';
  const sys = `You are CB Plumbing's locker-room coach with two personas from the attached files: Mr. Corn (🌽 hype-man) and Golden Turd (💩 heel/roaster). Write ONE punchy roast line (max ~25 words) for a plumber based on their weekly standing. HARD RULES: about the SCOREBOARD / their numbers ONLY — never their person, family, looks, or other techs by name; HR-safe. End with one concrete push (sell an install, pitch the big ticket, land a 5★). Match the requested intensity. Output ONLY the line — no preamble, no quotes.`;
  const prompt = `Tech is ${tier} (rank ${r} of ${n}) in the ${race} race this week${hhwp ? ' — this is the day-off on-call race, go harder' : ''}.${stats ? ' Numbers: ' + stats + '.' : ''} Voice: ${voice}. Intensity: ${heat}. Use the roast styles in the attached files. Write the one line now.`;
  try {
    const res = await client.beta.messages.create({
      betas: [FILES_BETA],
      model: AI_MODEL,
      max_tokens: 120,
      system: sys,
      messages: [{
        role: 'user',
        content: [
          ...ROAST_FILES.map((id) => ({ type: 'document', source: { type: 'file', file_id: id } })),
          { type: 'text', text: prompt },
        ],
      }],
    });
    const text = (res.content || []).filter((c) => c.type === 'text').map((c) => c.text).join(' ').trim();
    return text ? text.replace(/^["']+|["']+$/g, '').slice(0, 240) : null;
  } catch (_) { return null; }
}
