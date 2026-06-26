// Tool payoff math — pure, no I/O. Drives both the tech's /pay view and the manager payoff board.
export const dollarsToCents = (v) => Math.max(0, Math.round((Number(v) || 0) * 100));
export const centsToStr = (c) => '$' + ((Number(c) || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Weekly deduction from a tool value at a given % (e.g. $100 @ 7.5% = $7.50/wk). Never more than the value.
export function weeklyCents(purchaseCents, pct) {
  const w = Math.round((Number(purchaseCents) || 0) * (Number(pct) || 0) / 100);
  return Math.min(Math.max(0, w), Number(purchaseCents) || 0);
}

export const remainingCents = (p) => Math.max(0, (Number(p?.purchase_cents) || 0) - (Number(p?.paid_cents) || 0));
export const pctPaid = (p) => { const t = Number(p?.purchase_cents) || 0; return t > 0 ? Math.min(100, Math.round((Number(p?.paid_cents) || 0) / t * 100)) : 0; };
export function weeksLeft(p) {
  const w = Number(p?.weekly_cents) || 0; if (w <= 0) return null;
  return Math.ceil(remainingCents(p) / w);
}
// What this week's deduction should be — the weekly rate, capped so it never overshoots the remaining balance.
export const nextDeductionCents = (p) => Math.min(Number(p?.weekly_cents) || 0, remainingCents(p));
// Fired / quit before payoff: refund everything they've paid, company keeps the tool.
export const separationRefundCents = (p) => Number(p?.paid_cents) || 0;

// Roll up a tech's (or the whole crew's) active plans for the summary cards.
export function summarize(purchases = []) {
  const active = purchases.filter((p) => p.status === 'active');
  return {
    count: active.length,
    weeklyCents: active.reduce((s, p) => s + nextDeductionCents(p), 0),
    owedCents: active.reduce((s, p) => s + remainingCents(p), 0),
    paidCents: purchases.reduce((s, p) => s + (Number(p.paid_cents) || 0), 0),
  };
}
