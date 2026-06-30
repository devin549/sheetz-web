// Structured pricing math — pure + testable. Two layers on top of the base pricebook:
//   • after-hours MARKUP (%) — automatic, applied to the work when the JOB is after-hours
//   • service TIER (flat $) — manual urgency add (Standard/Priority/Emergency)
// The after-hours decision keys off the JOB'S SCHEDULED TIME (not "now"), so a late-built estimate on a
// daytime job is never overcharged. job.after_hours overrides: true=force on, false=force off, null=auto.

const ET = 'America/New_York';

// Is this job after-hours? Returns { applies, pct, reason }. settings from pricing_settings.
export function afterHoursForJob(job, settings = {}) {
  const pct = Number(settings.after_hours_pct ?? 10);
  const fromHour = Number(settings.after_hours_from_hour ?? 19);
  const weekendOn = settings.after_hours_weekend !== false;
  if (settings.active === false) return { applies: false, pct: 0, reason: '' };

  // Explicit per-job override wins.
  if (job && job.after_hours === true) return { applies: true, pct, reason: 'flagged after-hours' };
  if (job && job.after_hours === false) return { applies: false, pct: 0, reason: '' };

  // Auto: by the job's scheduled LOCAL (ET) time.
  const iso = job && job.scheduled_at;
  if (!iso) return { applies: false, pct: 0, reason: '' };
  let hour = NaN, wd = '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: ET, hour: 'numeric', hour12: false, weekday: 'short' }).formatToParts(new Date(iso));
    hour = Number(parts.find((p) => p.type === 'hour')?.value);
    if (hour === 24) hour = 0; // some ICU builds emit 24 for midnight
    wd = parts.find((p) => p.type === 'weekday')?.value || '';
  } catch (_) { return { applies: false, pct: 0, reason: '' }; }

  const isWeekend = weekendOn && (wd === 'Sat' || wd === 'Sun');
  const isLate = Number.isFinite(hour) && hour >= fromHour; // at/after 7pm
  if (isWeekend) return { applies: true, pct, reason: 'weekend' };
  if (isLate) return { applies: true, pct, reason: `after ${fromHour > 12 ? fromHour - 12 : fromHour}pm` };
  return { applies: false, pct: 0, reason: '' };
}

// Apply the tier flat-add + after-hours markup to a base subtotal (DOLLARS). The markup hits the WORK (base
// items) only — NOT the flat tier add — so urgency isn't double-charged. Returns a full breakdown for the
// estimate + the customer-facing lines.
export function applyPricing(subtotalDollars, { tierCents = 0, afterHours = { applies: false, pct: 0 } } = {}) {
  const base = Math.max(0, Number(subtotalDollars) || 0);
  const tier = Math.max(0, (Number(tierCents) || 0) / 100);
  const pct = afterHours && afterHours.applies ? Math.max(0, Number(afterHours.pct) || 0) : 0;
  const ahAmount = Math.round(base * (pct / 100) * 100) / 100;
  const total = Math.round((base + tier + ahAmount) * 100) / 100;
  return { base, tier, tierCents: Math.round(tier * 100), ahPct: pct, ahAmount, ahReason: (afterHours && afterHours.reason) || '', total };
}
