// On-call helpers shared by the /on-call page and the 4:30pm cron.
export const DAYS = [
  { field: 'mon', label: 'Monday' },
  { field: 'tue', label: 'Tuesday' },
  { field: 'wed', label: 'Wednesday' },
  { field: 'thu', label: 'Thursday' },
  { field: 'weekend', label: 'Weekend (Fri 5pm → Mon)' },
];
const DAY_FIELD = { Monday: 'mon', Tuesday: 'tue', Wednesday: 'wed', Thursday: 'thu', Friday: 'weekend', Saturday: 'weekend', Sunday: 'weekend' };

export function etWeekday(date = new Date()) {
  return date.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long' });
}

// Who's on tonight, given the schedule + a weekday name. { person, field, weekday } or null.
export function onCallFor(schedule, weekday) {
  if (!schedule) return null;
  const field = DAY_FIELD[weekday];
  if (!field) return null;
  return { person: schedule[field] || '', field, weekday };
}

// The #sheetz message for a given weekday (cron posts Mon–Fri; Fri names the weekend).
export function announceText(schedule, weekday) {
  const oc = onCallFor(schedule, weekday);
  if (!oc || !oc.person) return null;
  const sup = schedule.supervisor ? ` Supervisor: ${schedule.supervisor}.` : '';
  if (weekday === 'Friday') return `☎️ Weekend on-call (Fri 5pm → Mon 7am): ${oc.person}. Have a good weekend! 🍻${schedule.supervisor ? `\nWeek supervisor: ${schedule.supervisor}.` : ''}`;
  return `☎️ On-call tonight (5pm → 7am): ${oc.person}. After-hours calls go to them.${sup}`;
}
