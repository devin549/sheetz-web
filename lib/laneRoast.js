// Position-tiered race-lane roast — Mr. Corn (🌽 hype) + Golden Turd (💩 heel). It targets the VIEWING
// tech by their standing: leader = hype, top-3 = push, pack = blast, basement/HHWP-not-top-3 = let 'em
// have it. Template variety for now (seeded so it's stable per render but feels fresh); swaps to AI
// generated from Devin's Anthropic roast file once the file_id lands.
function hash(s) { let h = 0; const t = String(s); for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return Math.abs(h); }
const pick = (arr, seed) => arr[hash(seed) % arr.length];

const LINES = {
  leader: [
    "👑 Numbers like that, you should be a model — not a plumber. Now don't let up.",
    "🌽 Mr. Corn: That's the standard. Everybody else is chasing YOU. Stay nasty.",
    "First place looks good on you. Go embarrass them by Saturday.",
  ],
  top3: [
    "🌽 #1 is RIGHT there — one more install and the crown's yours. Take it.",
    "Top 3 is cute. The crown pays more. Quit coasting on drain clogs and pitch the big one.",
    "🌽 You're in the hunt. Don't get comfortable — the Turd's circling.",
  ],
  pack: [
    "💩 Captain Hook's looking for help — numbers like this you're working just to cover the light bill. MOVE.",
    "🌽 Mr. Corn's embarrassed, 💩 the Turd's grinning. Sell a water heater on your next drain call.",
    "Middle of the pack pays middle money. You've got a Ferrari engine — quit driving like a Civic.",
  ],
  basement: [
    "💩 Golden Turd: this is MY house and you're squatting in it. Sell something or it's yours for keeps.",
    "🌽+💩 tag-team: dead last with that skill is a CRIME. Captain Hook would fire you out of a cannon. GO.",
    "💩 Light bill numbers. Pathetic. One pitch — ONE — and you climb out. Stop plunging for free.",
  ],
};

// rank (1=best), total field size. opts.hhwp = the day-off race (blast harder). opts.seed for stability.
export function laneRoast(rank, total, opts = {}) {
  const r = Number(rank) || 0;
  // HHWP (day-off on-call) is harsher — no gentle top-3 push; non-leaders get the pack/basement blast.
  let tier;
  if (opts.hhwp) tier = r === 1 ? 'leader' : (total > 1 && r === total) ? 'basement' : 'pack';
  else tier = r === 1 ? 'leader' : r <= 3 ? 'top3' : (total > 1 && r === total) ? 'basement' : 'pack';
  return { tier, text: pick(LINES[tier], (opts.seed || '') + r + tier + (opts.hhwp ? 'h' : '')) };
}
