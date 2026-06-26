// Tool ledger helpers — event metadata + the per-tech accountability roll-up (who breaks / loses stuff).
export const TOOL_EVENTS = {
  added:    { label: 'Added',          icon: '➕' },
  issued:   { label: 'Issued',         icon: '📦' },
  loaned:   { label: 'Loaned',         icon: '🤝' },
  returned: { label: 'Returned',       icon: '↩️' },
  broke:    { label: 'Broke',          icon: '💥', bad: true },
  repaired: { label: 'Repaired',       icon: '🔧' },
  lost:     { label: 'Lost',           icon: '❓', bad: true },
  retired:  { label: 'Retired',        icon: '🪦' },
  reacked:  { label: 'Re-acknowledged', icon: '✅' },
  found:    { label: 'Found',          icon: '🔎' },
};
export const eventMeta = (e) => TOOL_EVENTS[e] || { label: e, icon: '•' };
// What status a tool lands in after an event (history lives in tool_events; this is the quick status).
export const STATUS_AFTER = { issued: 'issued', loaned: 'on_loan', returned: 'on_van', broke: 'broken', repaired: 'on_van', lost: 'lost', retired: 'retired', found: 'on_van', reacked: null, added: 'on_van' };

// Per-tech accountability from the event log: breaks, losses, and $ on their head. Sorted worst-first.
export function accountabilityByTech(events = []) {
  const by = {};
  events.forEach((e) => {
    if (!['broke', 'lost'].includes(e.event)) return;
    const t = e.holder_name || 'Unknown';
    const r = (by[t] = by[t] || { tech: t, broke: 0, lost: 0, costCents: 0 });
    if (e.event === 'broke') r.broke++; else r.lost++;
    r.costCents += Number(e.cost_cents) || 0;
  });
  return Object.values(by).sort((a, b) => (b.broke + b.lost) - (a.broke + a.lost) || b.costCents - a.costCents);
}
