// 🌽👑 Corn Crown / 💩 Golden Turd — per-job MARGIN coach. Fires when a tech enters materials on a job:
// at/above MARGIN_TARGET earns the praise line; below it gets the roast. Internal/private only, never
// customer-facing. Same HR-safety as lib/roast.js — every line is about the NUMBERS (margin, cost, ticket)
// and ends with a concrete fix; the roast LEVEL (PG/PG-13/R) only changes the heat. Pure function → runs
// identically on server and client (the cockpit shows it live as costs are typed).
// NOTE: this is the OPERATIONAL target; it's owner-editable via pricing_settings.margin_target_pct (mig 151).
// The 55% Corn-Crown/race AWARD thresholds are a separate gamification number — don't conflate them.

export const MARGIN_TARGET = 59; // % — code default; pricing_settings.margin_target_pct overrides server-side.

const usd0 = (n) => '$' + Math.round(Number(n || 0)).toLocaleString();
const firstName = (n) => String(n || 'Tech').trim().split(/\s+/)[0] || 'Tech';

export function computeMargin({ revenue, materialCost = 0, dispatchFee = 0 }) {
  const rev = Number(revenue) || 0;
  if (rev <= 0) return null;
  const cost = (Number(materialCost) || 0) + (Number(dispatchFee) || 0);
  const pct = Math.round(((rev - cost) / rev) * 100);
  const maxCostForTarget = rev * (1 - MARGIN_TARGET / 100); // cost ceiling to hit the MARGIN_TARGET %
  const overBy = Math.max(0, cost - maxCostForTarget);
  return { pct, rev, cost, overBy };
}

// Returns null until there's a revenue AND some cost to judge.
export function marginVerdict({ revenue, materialCost = 0, dispatchFee = 0, level = 'PG', name = '' }) {
  const m = computeMargin({ revenue, materialCost, dispatchFee });
  if (!m || (Number(materialCost) || 0) + (Number(dispatchFee) || 0) <= 0) return null;
  const n = firstName(name);

  // Above target → just GREEN + the Corn Crown. Clean confirmation, no roast (you don't roast a good job).
  if (m.pct >= MARGIN_TARGET) {
    const body = m.pct >= 75 ? `${m.pct}% — elite margin. That's how you feed the truck.` : `${m.pct}% — above the ${MARGIN_TARGET}% bar. 👑`;
    return { tier: 'corn', pct: m.pct, char: '🌽👑', speaker: 'Corn Crown', body, action: null, tone: 'good' };
  }

  // Below target → RED, lead with the gap + the dollars to bring it up. Roast line heat scales with the
  // roast level; always about the margin/numbers, never the tech.
  const lines = {
    PG: `Thin margin — the parts ate your profit. Tighten it up.`,
    'PG-13': `You did the work and handed the profit to the supply house.`,
    R: `That's a damn donation to the parts store. Mark it up or quit giving it away.`,
  };
  const action = m.overBy > 0
    ? `+${usd0(m.overBy)} to hit ${MARGIN_TARGET}% — cut that from cost or add it to the ticket.`
    : `Raise the ticket to clear ${MARGIN_TARGET}%.`;
  return { tier: 'turd', pct: m.pct, char: '💩', speaker: 'Golden Turd', body: lines[level] || lines.PG, action, tone: 'bad' };
}
