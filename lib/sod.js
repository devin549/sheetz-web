// Start of Day gate logic + reference content (ported from the HTML sod pane). The 3 HARD gates that
// block the first job: van pre-trip, tools check-out, handbook re-ack. Helper + KY-code are per-job
// (shown, not gated). Pure.

export const GAS_LEVELS = ['Full', '3/4', '1/2', '1/4', 'Below 1/4'];

// Handbook quarterly recap — read before signing (the policy sections the HTML lists).
export const HANDBOOK_RECAP = [
  ['§19', 'Pay held — not deducted — for callbacks'],
  ['§20', 'Doc fraud fee policy'],
  ['§21', 'Cash custody — drop daily, no overnight in the van'],
  ['§22', 'Final pay on termination — asset-recovery list'],
];

// KY code reminders shown per shift (reference only — no gate).
export const KY_CODE = [
  ['⛏ Excavation', 'OSHA shoring required at 5 ft. Sewer permit at 9 ft length OR house→tap. Backfill = 4" sight pipes + tracer wire + green sticker.'],
  ['💧 Water line', 'meter→house = permit + tracer wire + 4" sight pipes + green sticker + return-trip inspection.'],
  ['☠ Lead pipes', 'KY law — written disclosure to the customer before disturbing. KRS form auto-attaches in Forms.'],
];

// Handbook is "overdue" ~90 days after the last ack (quarterly).
export function handbookDue(lastAckISO, now) {
  if (!lastAckISO) return { due: true, daysOverdue: null };
  const days = Math.floor((now - Date.parse(lastAckISO)) / 86400000);
  return { due: days >= 90, daysOverdue: days >= 90 ? days - 90 : 0, lastDays: days };
}

// Gate state from today's sod row. ready = all 3 hard gates green.
export function gateState(sod) {
  sod = sod || {};
  const pretrip = !!sod.pretrip_done;
  const tools = !!sod.tools_confirmed;
  const handbook = !!sod.handbook_acked;
  const items = [
    { key: 'pretrip', label: 'Van pre-trip', green: pretrip },
    { key: 'tools', label: 'Tools check-out', green: tools },
    { key: 'handbook', label: 'Handbook re-ack', green: handbook },
  ];
  const greens = items.filter((i) => i.green).length;
  return { items, pretrip, tools, handbook, greens, required: items.length, ready: greens >= items.length, completed: !!sod.completed };
}
