// Weekly tech leaderboard — real data from jobs (revenue + completions this pay-week). Safe: no payroll
// math, just booked revenue + job counts per tech. Pay-week = Sunday 00:00 → Saturday 23:59 Eastern
// (CB's week boundary). Guarded + fail-soft: returns {available:false} if jobs can't be read.

function nyOffsetMin(d) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' }).formatToParts(d).find((p) => p.type === 'timeZoneName');
  const m = (part?.value || 'GMT-5').match(/GMT([+-]\d{1,2})(?::(\d{2}))?/); const h = m ? parseInt(m[1], 10) : -5;
  return h * 60 + (h < 0 ? -1 : 1) * parseInt((m && m[2]) || '0', 10);
}
// Sunday 00:00 ET of the current week → ISO window [start, end).
function nyWeekWindow(now) {
  const off = nyOffsetMin(now);
  const nyMs = now.getTime() + off * 60000;          // shift to ET wall clock
  const ny = new Date(nyMs);
  const dow = ny.getUTCDay();                          // 0 = Sunday (on the shifted clock)
  const midnight = Date.UTC(ny.getUTCFullYear(), ny.getUTCMonth(), ny.getUTCDate());
  const sundayWall = midnight - dow * 86400000;
  const startMs = sundayWall - off * 60000;            // shift back to real UTC
  return { startISO: new Date(startMs).toISOString(), endISO: new Date(startMs + 7 * 86400000).toISOString() };
}
const isDone = (s) => /done|complete|closed/.test(String(s || '').toLowerCase());

export async function weeklyLeaderboard(sb, meName, nowMs) {
  try {
    const now = Number.isFinite(nowMs) ? new Date(nowMs) : new Date(0); // caller passes Date.now() (server)
    const { startISO, endISO } = nyWeekWindow(Number.isFinite(nowMs) ? now : new Date());
    const { data, error } = await sb.from('jobs')
      .select('tech_name, amount, status, scheduled_at, techs(name)')
      .gte('scheduled_at', startISO).lt('scheduled_at', endISO);
    if (error) return { available: false };
    const by = new Map();
    for (const j of (data || [])) {
      const who = (j.techs && j.techs.name) || j.tech_name;
      if (!who) continue;
      const cur = by.get(who) || { who, revenue: 0, jobs: 0 };
      if (isDone(j.status)) { cur.revenue += Number(j.amount || 0); cur.jobs += 1; }
      by.set(who, cur);
    }
    const ranked = [...by.values()].filter((r) => r.jobs > 0).sort((a, b) => b.revenue - a.revenue);
    if (!ranked.length) return { available: true, empty: true, rows: [], you: null };
    const norm = (s) => String(s || '').trim().toLowerCase();
    const rows = ranked.map((r, i) => ({ n: i + 1, who: r.who, revenue: r.revenue, jobs: r.jobs, me: norm(r.who) === norm(meName) }));
    const meRow = rows.find((r) => r.me) || null;
    const top = rows[0];
    const you = meRow ? { rank: meRow.n, revenue: meRow.revenue, toFirst: Math.max(0, top.revenue - meRow.revenue) } : null;
    return { available: true, empty: false, rows, you };
  } catch { return { available: false }; }
}
