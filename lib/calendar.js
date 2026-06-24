// Build an "Add to Google Calendar" link (prefilled). Tapping it opens Google Calendar with the event
// ready to save — the practical "auto-fill their calendar" without needing each person's Google OAuth.
function gcalStamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

export function googleCalendarLink({ title, startISO, durationMin = 60, location = '', details = '' }) {
  if (!startISO) return '';
  const start = new Date(startISO);
  if (Number.isNaN(start.getTime())) return '';
  const end = new Date(start.getTime() + (Number(durationMin) || 60) * 60000);
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: title || 'Meeting',
    dates: `${gcalStamp(start)}/${gcalStamp(end)}`,
  });
  if (details) q.set('details', details);
  if (location) q.set('location', location);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}
