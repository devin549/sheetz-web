// CB-observed US holidays with REAL computed dates — so the /pto list always shows what's UPCOMING and past
// holidays drop off on their own (no more hardcoded "May 26 (today)" rows). 5 PAID (8hr) + 5 non-paid
// (on-call still runs). The per-holiday crew roster still comes from the office; this just fixes the dates.

// nth weekday of a month. month 0-based, weekday 0=Sun..6=Sat, n=1..5.
function nthWeekday(year, month, weekday, n) {
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}
// last weekday of a month (e.g., last Monday of May).
function lastWeekday(year, month, weekday) {
  const last = new Date(year, month + 1, 0);
  const offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month, last.getDate() - offset);
}
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// The 10 CB holidays for a calendar year, in date order. paid:true = the 5 paid holidays (8hr hourly).
export function holidaysForYear(year) {
  return [
    { key: 'new_year', name: "New Year's Day", date: iso(new Date(year, 0, 1)), paid: false },
    { key: 'mlk', name: 'MLK Day', date: iso(nthWeekday(year, 0, 1, 3)), paid: false },
    { key: 'memorial', name: 'Memorial Day', date: iso(lastWeekday(year, 4, 1)), paid: true },
    { key: 'juneteenth', name: 'Juneteenth', date: iso(new Date(year, 5, 19)), paid: false },
    { key: 'independence', name: 'Independence Day', date: iso(new Date(year, 6, 4)), paid: true },
    { key: 'labor', name: 'Labor Day', date: iso(nthWeekday(year, 8, 1, 1)), paid: true },
    { key: 'veterans', name: 'Veterans Day', date: iso(new Date(year, 10, 11)), paid: false },
    { key: 'thanksgiving', name: 'Thanksgiving', date: iso(nthWeekday(year, 10, 4, 4)), paid: true },
    { key: 'christmas_eve', name: 'Christmas Eve', date: iso(new Date(year, 11, 24)), paid: false },
    { key: 'christmas', name: 'Christmas', date: iso(new Date(year, 11, 25)), paid: true },
  ];
}

// Upcoming holidays from `todayStr` (YYYY-MM-DD) forward — this year's remaining + next year's, so the list
// rolls cleanly over the New Year. Each gets a friendly label + weekday. limit caps the count.
export function upcomingHolidays(todayStr, limit = 12) {
  const y = parseInt(String(todayStr).slice(0, 4), 10) || new Date().getFullYear();
  return [...holidaysForYear(y), ...holidaysForYear(y + 1)]
    .filter((h) => h.date >= todayStr)
    .slice(0, limit)
    .map((h) => {
      const d = new Date(h.date + 'T12:00:00');
      return {
        ...h,
        weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleDateString('en-US', { weekday: 'short' }),
        isToday: h.date === todayStr,
      };
    });
}
