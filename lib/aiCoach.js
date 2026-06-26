// Live-Claude Start-of-Day coach. Generates Hank's private coaching line from the tech's real scorecard,
// honoring the same HR guardrails as the deterministic lib/roast.js. ALWAYS fail-soft: any error / no key /
// bad output returns null, and the caller falls back to coachMessage() — so the screen never breaks or stalls.
import { getAnthropic, AI_MODEL, isAiConfigured } from '@/lib/anthropic';

const SYSTEM = `You are Hank — a blunt, funny plumber-teammate at Clog Busterz Plumbing. You write ONE private Start-of-Day coaching line for a single tech, shown only on their NDA-protected screen. It is NEVER seen by customers.

HARD RULES (never break these):
- Talk ONLY about the numbers and the work: ticket size, margin, on-time, photo proof, callbacks, closeouts. NEVER about the person — not their looks, family, intelligence, or ANY protected class (race, ethnicity, sex, orientation, gender, age, religion, disability, pregnancy, veteran status, weight). Ever.
- End with exactly ONE concrete action they can take today.
- Respect the roast LEVEL cap: PG = clean ribbing, no profanity. PG-13 = some bite, mild words only (crap, hell). R = real profanity allowed (shit, ass, damn, hell, and f**k written censored as f**k) but ALWAYS aimed at the numbers, never the person.
- Respect the TONE: "hype" = pure encouragement, no roast. "coach" = straight talk. "roast" = funny jabs. "nuclear" = harshest allowed by the level.
- If the numbers are good, praise + a stretch goal instead of a roast.

Output STRICT JSON only, no prose around it:
{"headline":"<=6 words","body":"1-2 sentences","action":"one clear action"}`;

function factLines(s) {
  if (!s || !s.available) return 'No scored shift yet — this is their first tracked day.';
  const L = [];
  L.push(`revenue $${Math.round(s.revenue || 0)} on ${s.jobs || 0} jobs`);
  if (s.avgTicket != null) L.push(`average ticket $${s.avgTicket} (target $650)`);
  if (s.conversion != null) L.push(`conversion ${s.conversion}% (target 50%)`);
  if (s.onTimePct != null) L.push(`on-time ${s.onTimePct}% (target 95%)`);
  if (s.photoQa) L.push(`photo QA ${s.photoQa.pass} pass / ${s.photoQa.fail} fail`);
  if (s.callbacks != null) L.push(`${s.callbacks} callbacks`);
  if (s.closeoutPct != null) L.push(`closeout ${s.closeoutPct}%`);
  return L.join('; ');
}

export async function generateCoach({ name, scorecard, tone = 'coach', level = 'PG', role = 'tech' }) {
  if (!isAiConfigured(role)) return null;
  try {
    const client = getAnthropic(role);
    if (!client) return null;
    const first = String(name || 'the tech').trim().split(/\s+/)[0];
    const user = `Tech: ${first}\nTone: ${tone}\nRoast level cap: ${level}\nLast shift: ${factLines(scorecard)}\n\nWrite the JSON coaching line.`;
    const res = await client.messages.create({ model: AI_MODEL, max_tokens: 280, system: SYSTEM, messages: [{ role: 'user', content: user }] });
    const text = (res?.content || []).map((b) => b.text || '').join('').trim();
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]);
    if (!j.body) return null;
    return { headline: String(j.headline || 'Today\'s one thing').slice(0, 60), body: String(j.body).slice(0, 400), action: String(j.action || '').slice(0, 200), emoji: tone === 'hype' ? '🔥' : tone === 'nuclear' ? '☢️' : tone === 'roast' ? '🌶️' : '🧢', ai: true, clean: !/\b(thin|under|below|0%|fail|callback)\b/i.test(String(j.body)) };
  } catch (_) { return null; }
}
