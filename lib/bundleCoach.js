// lib/bundleCoach.js — pure, client-safe helpers for the GBB Bundle Builder.
// (1) computeLadder: derive the three tier prices the SAME way buildTiers/the customer close does — sum of
//     retail × qty for items whose `tiers` array includes that key. Kept in sync with lib/pricebookEngine
//     buildTiers (Good=sum of 'good' items, etc.; Better is the recommended hero).
// (2) coachLadder: honest, in-builder conversion HINTS (compromise effect, anchoring, charm vs round
//     pricing). Hints only — never enforces, never changes a price. No fabricated social proof / urgency.

export const TIER_KEYS = ['good', 'better', 'best'];
export const TIER_META = {
  good: { label: 'Good', icon: '🔧', role: 'Honest floor — real but bare. Make it slightly unattractive on purpose.' },
  better: { label: 'Better', icon: '⭐', role: 'The TARGET. Recommended hero — engineer it as where most land (compromise effect).' },
  best: { label: 'Best', icon: '👑', role: 'High anchor / decoy. Legit premium that makes Better look smart.' },
};

// Live tier prices from the builder's working item list. Each item: { price, quantity, tiers:[...] }.
export function computeLadder(items = []) {
  const out = {};
  for (const key of TIER_KEYS) {
    const inTier = items.filter((it) => (it.tiers || []).includes(key));
    out[key] = {
      key,
      price: inTier.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0),
      count: inTier.length,
      recommended: key === 'better', // middle tier is the default nudge — matches buildTiers
    };
  }
  return out;
}

// Honest coaching for the owner as they tune. Returns [{ level:'ok'|'warn'|'tip', text }]. Pure.
export function coachLadder(items = []) {
  const L = computeLadder(items);
  const g = L.good.price, b = L.better.price, x = L.best.price;
  const out = [];
  const charm = (n) => n > 0 && (String(Math.round(n)).endsWith('5') || String(Math.round(n)).endsWith('9'));
  const round = (n) => n > 0 && Math.round(n) % 50 === 0;

  // Completeness — every tier should hold something or the close hides/flattens it.
  const empty = TIER_KEYS.filter((k) => L[k].count === 0);
  if (empty.length) out.push({ level: 'warn', text: `${empty.map((k) => TIER_META[k].label).join(' & ')} ${empty.length > 1 ? 'have' : 'has'} no items — that tier won't show on the close. A real 3-tier ladder needs all three.` });

  // Monotonic ladder — Good < Better < Best, or the compromise effect breaks.
  if (g > 0 && b > 0 && g >= b) out.push({ level: 'warn', text: `Better ($${Math.round(b)}) isn't priced above Good ($${Math.round(g)}). The middle (target) tier must read as the step up.` });
  if (b > 0 && x > 0 && b >= x) out.push({ level: 'warn', text: `Best ($${Math.round(x)}) isn't above Better ($${Math.round(b)}). Best is your anchor — it should be the clear premium.` });

  // Lopsided steps — Best should sit well above Better so Better looks like the smart value (decoy effect).
  if (g > 0 && b > 0 && x > 0 && g < b && b < x) {
    const up = b - g, top = x - b;
    if (top < up * 0.6) out.push({ level: 'tip', text: `The jump to Best ($${Math.round(top)}) is small vs the jump to Better ($${Math.round(up)}). A bigger Best gap makes Better the obvious value (decoy effect).` });
    if (top > up * 4) out.push({ level: 'tip', text: `Best is a long way above Better. A sky-high anchor can feel irrelevant — keep it aspirational but believable.` });
  }

  // Charm vs round pricing — Good reads "deal" ($-95/$-99), Best reads "quality" (round/premium).
  if (g > 0 && !charm(g)) out.push({ level: 'tip', text: `Good ($${Math.round(g)}) reads as a "deal" tier — charm pricing (…95 / …99) leans into that. Owner-only call.` });
  if (x > 0 && !round(x)) out.push({ level: 'tip', text: `Best ($${Math.round(x)}) is your quality anchor — round/premium numbers (e.g. $1,200) signal quality more than charm endings. Owner-only call.` });

  // Good ⊆ Better ⊆ Best convention — items in a lower tier usually carry up.
  const goodItems = items.filter((it) => (it.tiers || []).includes('good'));
  const goodNotInBetter = goodItems.filter((it) => !(it.tiers || []).includes('better'));
  if (goodNotInBetter.length) out.push({ level: 'tip', text: `${goodNotInBetter.length} item(s) are in Good but not Better. By convention each step includes everything below it — double-check that's intended.` });

  if (!out.length && g > 0 && b > 0 && x > 0) out.push({ level: 'ok', text: 'Ladder looks healthy: three tiers, rising prices, Better is the recommended middle. 👍' });
  return out;
}
