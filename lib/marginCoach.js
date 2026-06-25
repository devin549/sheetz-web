// 🌽👑 Corn Crown / 💩 Golden Turd — per-job MARGIN coach. Fires when a tech enters materials on a job:
// ≥55% gross margin earns the Corn Crown (praise); under 55% gets the Golden Turd (roast). Internal/
// private only, never customer-facing. Same HR-safety as lib/roast.js — every line is about the NUMBERS
// (margin, cost, ticket) and ends with a concrete fix; the roast LEVEL (PG/PG-13/R) only changes the heat.
// Pure function → runs identically on server and client (the cockpit shows it live as costs are typed).

export const MARGIN_TARGET = 55; // %

const usd0 = (n) => '$' + Math.round(Number(n || 0)).toLocaleString();
const firstName = (n) => String(n || 'Tech').trim().split(/\s+/)[0] || 'Tech';

export function computeMargin({ revenue, materialCost = 0, dispatchFee = 0 }) {
  const rev = Number(revenue) || 0;
  if (rev <= 0) return null;
  const cost = (Number(materialCost) || 0) + (Number(dispatchFee) || 0);
  const pct = Math.round(((rev - cost) / rev) * 100);
  const maxCostForTarget = rev * (1 - MARGIN_TARGET / 100); // cost ceiling to hit 55%
  const overBy = Math.max(0, cost - maxCostForTarget);
  return { pct, rev, cost, overBy };
}

// Returns null until there's a revenue AND some cost to judge.
export function marginVerdict({ revenue, materialCost = 0, dispatchFee = 0, level = 'PG', name = '' }) {
  const m = computeMargin({ revenue, materialCost, dispatchFee });
  if (!m || (Number(materialCost) || 0) + (Number(dispatchFee) || 0) <= 0) return null;
  const n = firstName(name);

  if (m.pct >= MARGIN_TARGET) {
    const body = m.pct >= 75
      ? `${m.pct}% — Drain Queen numbers. That's how you feed the truck. Keep stacking.`
      : `${m.pct}% margin — that clears our ${MARGIN_TARGET}% bar. Crown earned.`;
    return { tier: 'corn', pct: m.pct, char: '🌽👑', speaker: 'Corn Crown', headline: `${m.pct}% margin — Corn Crown!`, body, action: 'Lock it in — this is the standard.', tone: 'good' };
  }

  // Golden Turd — under target. Heat scales with the roast level; always about the margin, never the tech.
  const lines = {
    PG: `${m.pct}% margin is thin — the parts ate your profit. Tighten it up.`,
    'PG-13': `${m.pct}%? You did the work and handed the profit to the supply house.`,
    R: `${m.pct}% margin is a damn donation to the parts store. Mark it up or quit giving it away.`,
  };
  const action = m.overBy > 0
    ? `Hit ${MARGIN_TARGET}%: cut ${usd0(m.overBy)} of cost or raise the ticket.`
    : `Raise the ticket to clear ${MARGIN_TARGET}%.`;
  return { tier: 'turd', pct: m.pct, char: '💩', speaker: 'Golden Turd', headline: `${m.pct}% margin — Golden Turd`, body: lines[level] || lines.PG, action, tone: 'bad' };
}
