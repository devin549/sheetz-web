// Pure validation for a tech's "running late / need help" ETA report. Kept out of the server action so it's
// testable and runs the same everywhere. Rules (from the owner audit):
//   • A plain ETA must carry real minutes — no zero-minute noise. The HELP ping is the only 0-minute path.
//   • Every report needs a reason — the office relays it to the customer; a help ping with no note isn't
//     actionable.
//   • Minutes are clamped to a sane 0–480 (8h) window.
export const ETA_MAX_MIN = 480;

export function normalizeEta({ minutes, note, needsHelp } = {}) {
  const mins = Math.max(0, Math.min(ETA_MAX_MIN, Math.round(Number(minutes) || 0)));
  const reason = String(note == null ? '' : note).trim().slice(0, 400);
  const help = !!needsHelp;
  if (!mins && !help) return { ok: false, msg: 'Pick how late (or ask for office help).' };
  if (!reason) return { ok: false, msg: help ? 'Add a quick note so the office knows what you need.' : 'Add a reason — the office relays it to the customer.' };
  return { ok: true, mins, reason, needsHelp: help };
}
