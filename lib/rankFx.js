// Shared rank → visual-treatment map for the gamified screens (Start of Day + Races). Pure function so
// it runs on the server (page loader) and the client (RankFx effects) identically. Keeps the celebration
// rules in ONE place: #1 = crown + fireworks, top-3 = medal + light celebration, last = playful poop
// badge tied to a comeback action, and a "Comeback Run" badge when a tech climbs 2+ spots since last shift.
//
// Safety: the badges here are board-safe (fun, never cruel, never personal). The spicier ROAST text lives
// in lib/roast.js and is rendered private-to-the-tech only — never on a public board.

const MEDAL = {
  1: { tier: 'king', badge: '👑', metal: '#ffd24a', label: 'Top Plunger' },
  2: { tier: 'silver', badge: '🥈', metal: '#cdd3dd', label: 'Podium' },
  3: { tier: 'bronze', badge: '🥉', metal: '#d8995a', label: 'Podium' },
};

// Playful basement lines — rotate by a stable seed (name) so it's not the same jab every day, but is
// deterministic (no Math.random — keeps SSR stable). Always points at a climb, never at the person.
const BASEMENT_LINES = [
  'Basement today. Climb out.',
  'Bottom of the drain. Only one way to flow: up.',
  'Someone\'s gotta hold the floor down — but not all week. Climb.',
  'Last is just first, upside down. Flip it today.',
];
function seedOf(s) { let h = 0; const str = String(s || ''); for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return Math.abs(h); }

// rank: 1-based (number) or null. total: field size. prevRank: where they stood last worked shift (or null).
export function rankEffect({ rank, total = 0, prevRank = null, seed = '' } = {}) {
  const r = Number(rank);
  const hasRank = Number.isFinite(r) && r >= 1;
  const movement = (Number.isFinite(prevRank) && hasRank) ? (prevRank - r) : null; // + = moved up
  const comeback = movement != null && movement >= 2;
  const climbedFromLast = comeback && Number.isFinite(prevRank) && prevRank === total && total > 2 && r <= Math.ceil(total / 2);

  let base;
  if (!hasRank || total <= 0) {
    base = { tier: 'mid', badge: '🧰', metal: 'var(--amber)', label: 'On the board', sub: 'No rank yet — today sets it.', fx: null, king: false };
  } else if (r === total && total > 1) {
    base = { tier: 'basement', badge: '💩', metal: '#9b7a3a', label: 'Basement', sub: BASEMENT_LINES[seedOf(seed) % BASEMENT_LINES.length], fx: 'poop', king: false };
  } else if (MEDAL[r]) {
    const m = MEDAL[r];
    base = { tier: m.tier, badge: m.badge, metal: m.metal, label: m.label, king: r === 1,
      sub: r === 1 ? 'Current King — hold the crown.' : r === 2 ? 'One push off the top.' : 'On the podium.',
      fx: r === 1 ? 'fireworks' : 'sheen' };
  } else {
    base = { tier: 'mid', badge: '🛠️', metal: 'var(--amber)', label: `#${r}`, sub: 'In the pack — make a move.', fx: null, king: false };
  }

  // Comeback overlay — celebration is additive (confetti) and the label is its own badge.
  let comebackLabel = null, comebackExtra = false;
  if (climbedFromLast) { comebackLabel = '🚀 Out of the Basement'; comebackExtra = true; }
  else if (comeback) { comebackLabel = `📈 Comeback Run +${movement}`; }
  // If they climbed but aren't already firing fireworks, give them confetti.
  const fx = base.fx || (comeback ? 'confetti' : null);

  return { ...base, rank: hasRank ? r : null, total, movement, comeback, comebackLabel, comebackExtra, fx };
}

// Small label for a single metric rank chip ("#2 / 9").
export function rankChip(rank, total) {
  if (rank == null || !Number.isFinite(Number(rank))) return { txt: '—', tone: 'mid' };
  const r = Number(rank);
  const tone = r === 1 ? 'king' : r <= 3 ? 'podium' : (total && r === total) ? 'basement' : 'mid';
  return { txt: `#${r}${total ? ` / ${total}` : ''}`, tone };
}
