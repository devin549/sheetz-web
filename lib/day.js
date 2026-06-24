// Eastern-time day windows — CB runs on America/New_York. Shared by the board, supervisor QA,
// scorecard, and any screen that buckets by "today".

export function nyOffsetMinutes(d) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' })
    .formatToParts(d).find((p) => p.type === 'timeZoneName');
  const m = (part?.value || 'GMT-5').match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);
  if (!m) return -300;
  const h = parseInt(m[1], 10);
  return h * 60 + (h < 0 ? -1 : 1) * parseInt(m[2] || '0', 10);
}
export function nyTodayStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}
export function nyDayWindow(dateStr) {
  const off = nyOffsetMinutes(new Date(Date.parse(dateStr + 'T12:00:00Z')));
  const startMs = Date.parse(dateStr + 'T00:00:00Z') - off * 60000;
  return { startISO: new Date(startMs).toISOString(), endISO: new Date(startMs + 86400000).toISOString() };
}
