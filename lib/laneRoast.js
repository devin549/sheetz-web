// Position-tiered race-lane roast — Mr. Corn (🌽 hype) + Golden Turd (💩 heel). It targets the VIEWING
// tech by their standing AND scales to the roast LEVEL they picked (PG = clean ribbing · PG-13 = some
// bite · R = no mercy). Always about the SCOREBOARD, never the person (HR-safe — same rule as lib/roast).
// Template variety now (seeded so it's stable per render but feels fresh); swaps to AI generated from
// Devin's Anthropic roast file once the file_id lands.
function hash(s) { let h = 0; const t = String(s); for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return Math.abs(h); }
const pick = (arr, seed) => arr[hash(seed) % arr.length];

// LINES[tier][level] — intensity scales with the tech's chosen rating.
const LINES = {
  leader: {
    PG: ["👑 That's the standard right there. Stay on it.", "👑 Leading the board — clean and steady. Keep it up."],
    'PG-13': ["👑 Numbers like that, you make it look easy. Don't get comfortable.", "👑 You set the pace. Everybody else is chasing YOU now."],
    R: ["👑 Numbers like that, you should be a model — not a plumber. Now go embarrass them.", "🌽 Mr. Corn: that's the standard. Stay nasty and run it up."],
  },
  top3: {
    PG: ["🌽 So close — one good install and you're #1. You've got this.", "🌽 Right in the mix. Keep pushing."],
    'PG-13': ["🌽 #1's right there. Quit coasting on drain clogs and pitch the big one.", "🌽 Top 3 is good — the crown pays better. Go take it."],
    R: ["🌽 Top 3 is cute. The crown pays more. Stop leaving money on the floor and TAKE it.", "🌽 You're in the hunt — the Turd's circling. Close it before Saturday."],
  },
  pack: {
    PG: ["🌽 Middle of the pack — one water-heater pitch moves you up. Go get it.", "🌽 Solid week building — sell the install and climb."],
    'PG-13': ["💩 Captain Hook needs help and so do these numbers. Sell the install.", "🌽 Ferrari engine, Civic driving. Open it up and pitch big."],
    R: ["💩 Numbers like this you're working just to cover the light bill. MOVE.", "💩 Middle money for middle effort. Water heater on your next drain call — now."],
  },
  basement: {
    PG: ["💩 Bottom of the board — but one big ticket flips it. Let's climb.", "💩 Last for now. One install and you're off the bottom."],
    'PG-13': ["💩 Dead last. You've got a Ferrari engine — quit driving like a Civic.", "💩 Golden Turd's comfortable down here with you. Sell something and leave."],
    R: ["💩 Golden Turd: light-bill numbers with that skill is a CRIME. One pitch and you climb. GO.", "💩 Bottom of the board, plunging for free. ONE install fixes it — stop stalling."],
  },
};

const LVLS = ['PG', 'PG-13', 'R'];
const normLevel = (l) => (LVLS.includes(l) ? l : 'PG-13');

// rank (1=best), total field size. opts.level = PG|PG-13|R (default PG-13). opts.hhwp = day-off race
// (harsher — no gentle top-3 push). opts.seed for stable-but-fresh selection.
export function laneRoast(rank, total, opts = {}) {
  const r = Number(rank) || 0;
  const level = normLevel(opts.level);
  let tier;
  if (opts.hhwp) tier = r === 1 ? 'leader' : (total > 1 && r === total) ? 'basement' : 'pack';
  else tier = r === 1 ? 'leader' : r <= 3 ? 'top3' : (total > 1 && r === total) ? 'basement' : 'pack';
  const set = LINES[tier][level] || LINES[tier]['PG-13'];
  return { tier, level, text: pick(set, (opts.seed || '') + r + tier + level + (opts.hhwp ? 'h' : '')) };
}
