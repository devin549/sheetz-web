// On-site (wrench-time) hours, derived from the job timeline the board already stamps:
// started_at (on site) → completed_at. Conservative — drive/shop time isn't counted, and bad data
// (negative or >12h on one job) is clamped to 0. Payroll seeds hours from this; the approver edits.

export function onsiteHours(startedAt, completedAt) {
  if (!startedAt || !completedAt) return 0;
  const h = (new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 3600000;
  return h > 0 && h <= 12 ? Math.round(h * 100) / 100 : 0;
}
