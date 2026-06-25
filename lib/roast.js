// Hank's Start-of-Day coach message. INTERNAL/PRIVATE only — never customer-facing.
// Deterministic + HR-safe by construction: every line is tied to a METRIC and a NUMBER and ends with
// ONE concrete action. The tone dial changes the heat, never the target. "Nuclear" is spicier wording
// about the SCOREBOARD ("that $185 ticket is starving the truck"), never about the person, their family,
// looks, or anything an HR file would care about. No name-calling, no slurs, no comparisons to other techs
// by name. Pure function so it runs identically on server and client (the tech can flip tones live).

export const TONES = [
  { id: 'hype', label: 'Hype', emoji: '🔥', blurb: 'Pump me up' },
  { id: 'coach', label: 'Coach', emoji: '🧢', blurb: 'Straight talk' },
  { id: 'roast', label: 'Roast', emoji: '🌶️', blurb: 'Give it to me' },
  { id: 'nuclear', label: 'Nuclear Roast', emoji: '☢️', blurb: 'No mercy (still clean)' },
];

// The roast LEVEL (set once in Settings, then locked — owner/GM can override) is the intensity ceiling.
// It governs which tones a tech may pick: PG = clean ribbing, PG-13 = some bite, R = no mercy. 'hype' is
// always available (it's encouragement, not a roast). This is the HR-safety floor — a tech can't game the
// roast harsher than their locked level.
export const ROAST_LEVELS = [
  { id: 'PG', label: 'PG', blurb: 'Clean ribbing' },
  { id: 'PG-13', label: 'PG-13', blurb: 'Some bite' },
  { id: 'R', label: 'R', blurb: 'No mercy — thick skin required' },
];
const ROAST_ORDER = ['coach', 'roast', 'nuclear']; // intensity ladder (hype sits outside it)
const LEVEL_MAX = { PG: 0, 'PG-13': 1, R: 2 };       // index into ROAST_ORDER

// Tones a given level unlocks (hype + everything up to the ceiling).
export function tonesForLevel(level) {
  const max = LEVEL_MAX[level] ?? 0;
  return ['hype', ...ROAST_ORDER.slice(0, max + 1)];
}
// Clamp a requested tone down to what the level allows.
function clampTone(tone, level) {
  if (tone === 'hype') return 'hype';
  const max = LEVEL_MAX[level] ?? 0;
  const idx = ROAST_ORDER.indexOf(tone);
  if (idx < 0) return 'coach';
  return ROAST_ORDER[Math.min(idx, max)];
}

const usd0 = (n) => '$' + Math.round(Number(n || 0)).toLocaleString();
const pct = (n) => `${Math.round(Number(n || 0))}%`;
const firstName = (n) => String(n || 'Tech').trim().split(/\s+/)[0] || 'Tech';

// CB targets — the numbers that feed the truck.
const T = { avgTicket: 650, conversion: 50, onTime: 95, review: 4.8, closeout: 100 };

// Each issue: does the scorecard show a problem? how bad? and the 4 tone-lines + the ONE action.
// `sc` = { revenue, jobs, avgTicket, conversion(0-100), onTimePct, reviewRating, photoQa:{pass,fail},
//          callbacks, partsMisses, closeoutPct }
// `weight` biases which metric Hank leads with when several are off: the MONEY metrics (average ticket,
// close rate) are the business headline, so they win ties over hygiene metrics like closeout — otherwise
// "0% closeout" (always true on a no-photo day) would bury the real story every morning.
const ISSUES = [
  {
    id: 'avgTicket', weight: 1.5,
    has: (s) => s.jobs > 0 && s.avgTicket != null && s.avgTicket < T.avgTicket,
    sev: (s) => (T.avgTicket - s.avgTicket) / T.avgTicket,
    action: 'Give every customer two options before you touch a tool.',
    lines: (s, n) => ({
      hype: `${n}, you cleared ${s.jobs} jobs — now let's make each one count. Your average ticket sat at ${usd0(s.avgTicket)}; you're one good option-sheet away from ${usd0(T.avgTicket)}+.`,
      coach: `${n}, ${usd0(s.avgTicket)} average ticket is under our ${usd0(T.avgTicket)} bar. The work was there — the presentation wasn't.`,
      roast: `${n}, a ${usd0(s.avgTicket)} average ticket is not feeding the truck. You did the labor and left the money on the porch.`,
      nuclear: `${n}, ${usd0(s.avgTicket)} average? That's a tip jar, not a ticket. The truck eats diesel, not "I just snaked it real quick."`,
    }),
  },
  {
    id: 'conversion', weight: 1.3,
    has: (s) => s.conversion != null && s.conversion < T.conversion && (s.estimates || 0) > 0,
    sev: (s) => (T.conversion - s.conversion) / T.conversion,
    action: 'On every estimate, present good/better/best and ask for the sale out loud.',
    lines: (s, n) => ({
      hype: `${n}, you booked ${pct(s.conversion)} of your estimates — close just one more in three and you're a closer.`,
      coach: `${n}, ${pct(s.conversion)} close rate is below ${pct(T.conversion)}. You're quoting fine; you're not asking for the yes.`,
      roast: `${n}, ${pct(s.conversion)} conversion means you drove out, diagnosed it, and gift-wrapped the job for the next guy.`,
      nuclear: `${n}, ${pct(s.conversion)} close rate is a guided tour, not a sales call. You're basically a free second opinion in a CB shirt.`,
    }),
  },
  {
    id: 'onTime', weight: 1.0,
    has: (s) => s.onTimePct != null && s.onTimePct < T.onTime,
    sev: (s) => (T.onTime - s.onTimePct) / T.onTime,
    action: 'Roll 15 minutes early and hit "On My Way" before you pull out of the driveway.',
    lines: (s, n) => ({
      hype: `${n}, ${pct(s.onTimePct)} on-time — tighten the first run of the day and that's a clean 100%.`,
      coach: `${n}, ${pct(s.onTimePct)} on-time is under ${pct(T.onTime)}. Late starts cost us the schedule and the scorecard.`,
      roast: `${n}, ${pct(s.onTimePct)} on-time. The customer was ready; the truck was a rumor.`,
      nuclear: `${n}, ${pct(s.onTimePct)} on-time. Half the route is still waiting on you like a cold cup of coffee. The clock is a metric, not a suggestion.`,
    }),
  },
  {
    id: 'photoQa', weight: 1.0,
    has: (s) => (s.photoQa?.fail || 0) > 0,
    sev: (s) => Math.min(1, (s.photoQa.fail || 0) / 4),
    action: 'Shoot before + after + the data plate on every job — proof closes the ticket.',
    lines: (s, n) => ({
      hype: `${n}, ${s.photoQa.pass || 0} photos passed QA — just clean up the ${s.photoQa.fail} that bounced and your proof game is elite.`,
      coach: `${n}, ${s.photoQa.fail} photo${s.photoQa.fail > 1 ? 's' : ''} failed QA. No proof, no clean closeout, slower pay.`,
      roast: `${n}, ${s.photoQa.fail} failed photos. A blurry thumb in a dark cabinet isn't "before and after."`,
      nuclear: `${n}, ${s.photoQa.fail} photos failed QA. The office is playing CSI with your thumb-blur. Point the camera at the work, not the floor.`,
    }),
  },
  {
    id: 'callbacks', weight: 1.25,
    has: (s) => (s.callbacks || 0) > 0,
    sev: (s) => Math.min(1, (s.callbacks || 0) / 2),
    action: 'Water-test every repair twice before you load the truck.',
    lines: (s, n) => ({
      hype: `${n}, one ${s.callbacks > 1 ? 'few' : ''} callback to button up — fix it clean and your first-time-fix rate is back on top.`,
      coach: `${n}, ${s.callbacks} callback${s.callbacks > 1 ? 's' : ''} on the board. A redo is a free job we pay for twice.`,
      roast: `${n}, ${s.callbacks} callback${s.callbacks > 1 ? 's' : ''}. You closed the ticket; the leak didn't get the memo.`,
      nuclear: `${n}, ${s.callbacks} callback${s.callbacks > 1 ? 's' : ''}. We're paying round-trip diesel so you can re-meet a leak you already met. Test it twice or meet it thrice.`,
    }),
  },
  {
    id: 'closeout', weight: 0.7,
    has: (s) => s.closeoutPct != null && s.closeoutPct < T.closeout && s.jobs > 0,
    sev: (s) => (T.closeout - s.closeoutPct) / T.closeout,
    action: 'Finish every closeout before you leave the driveway — photos, payment, disposition.',
    lines: (s, n) => ({
      hype: `${n}, ${pct(s.closeoutPct)} of jobs fully closed — sweep the stragglers and it's a perfect board.`,
      coach: `${n}, only ${pct(s.closeoutPct)} of jobs got a full closeout. Half-closed jobs stall billing and pay.`,
      roast: `${n}, ${pct(s.closeoutPct)} closeout rate. You finished the plumbing and ghosted the paperwork.`,
      nuclear: `${n}, ${pct(s.closeoutPct)} closeout. The wrench part is done; the "actually get paid" part is apparently optional to you. It isn't.`,
    }),
  },
  {
    id: 'review', weight: 1.1,
    has: (s) => s.reviewRating != null && s.reviewRating < T.review,
    sev: (s) => (T.review - s.reviewRating) / T.review,
    action: 'Ask for the review at the door while they\'re still smiling — then text the link.',
    lines: (s, n) => ({
      hype: `${n}, ${s.reviewRating.toFixed(1)}★ is solid — one more "wow" moment a job and you're at 4.8★+.`,
      coach: `${n}, ${s.reviewRating.toFixed(1)}★ average is under our 4.8★ bar. The stars follow the handoff.`,
      roast: `${n}, ${s.reviewRating.toFixed(1)}★. Great pipe work, forgettable goodbye.`,
      nuclear: `${n}, ${s.reviewRating.toFixed(1)}★. You did surgery and signed off like a ghost. Stars don't tip themselves.`,
    }),
  },
];

// Clean sheet → can't roast numbers that are good. Praise + a stretch goal (tone still flavors it).
function cleanSheet(name, tone, s) {
  const n = firstName(name);
  const headline = { hype: '🔥 Clean board. Now go bigger.', coach: '✅ Solid shift. Hold the standard.', roast: '😤 Nothing to roast. Annoying.', nuclear: '☢️ I came loaded and you gave me nothing. Rude.' }[tone];
  const body = {
    hype: `${n}, ${usd0(s.revenue)} on ${s.jobs} job${s.jobs === 1 ? '' : 's'}, clean QA, on time. That's the standard — today, beat it.`,
    coach: `${n}, last shift was tight: ${usd0(s.revenue)}, ${s.jobs} job${s.jobs === 1 ? '' : 's'}, no callbacks, proof in. Keep doing exactly that.`,
    roast: `${n}, you closed clean — ${usd0(s.revenue)}, no callbacks, photos in. I had jokes ready and you wasted them. Don't get comfortable.`,
    nuclear: `${n}, I loaded the cannon and you handed me a spotless board — ${usd0(s.revenue)}, zero strikes. Fine. Stay perfect or I get to use these.`,
  }[tone];
  return { headline, body, action: 'Beat yesterday: one bigger ticket and a review on every job.', emoji: TONES.find((t) => t.id === tone)?.emoji || '🧢', issue: null, clean: true };
}

// Build the message. Picks the single WORST metric with data; if none, returns the clean-sheet praise.
export function coachMessage({ name, tone = 'coach', scorecard, level = 'PG' }) {
  const requested = TONES.find((x) => x.id === tone) ? tone : 'coach';
  const t = clampTone(requested, level); // never hotter than the locked roast level
  const s = scorecard || {};
  if (!s || !s.available) {
    const n = firstName(name);
    return { headline: '🌅 Fresh start', body: `${n}, no scored shift to pull from yet — so today writes the first page. Make it a good number.`, action: 'Two options on every job, proof on every close.', emoji: '🌅', issue: null, clean: true };
  }
  const wsev = (i) => i.sev(s) * (i.weight || 1);
  const problems = ISSUES.filter((i) => i.has(s)).sort((a, b) => wsev(b) - wsev(a));
  if (!problems.length) return cleanSheet(name, t, s);

  const worst = problems[0];
  const n = firstName(name);
  const body = worst.lines(s, n)[t];
  const headlineByTone = {
    hype: '🔥 Today\'s one thing',
    coach: '🧢 Straight talk',
    roast: '🌶️ Roasted (with love)',
    nuclear: '☢️ Nuclear roast',
  };
  // Secondary nudge if there's a second problem — keeps it honest without piling on.
  const second = problems[1] ? ` Also watch your ${labelOf(problems[1].id)}.` : '';
  return {
    headline: headlineByTone[t],
    body: body + (t === 'hype' ? '' : second),
    action: worst.action,
    emoji: TONES.find((x) => x.id === t).emoji,
    issue: worst.id,
    clean: false,
  };
}

function labelOf(id) {
  return ({ avgTicket: 'average ticket', conversion: 'close rate', onTime: 'on-time starts', photoQa: 'photo proof', callbacks: 'callbacks', closeout: 'closeouts', review: 'review stars' })[id] || id;
}
