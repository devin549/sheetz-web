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

// XP / tier — real signal: lifetime completed jobs (×10 XP) + award_grant points. 300 XP per level,
// capped at 10. Tiers mirror the SPA ladder. Guarded + fail-soft (returns null → screens use sample).
const XP_PER_LEVEL = 300;
const TIER = (lvl) => lvl >= 8 ? 'Legend' : lvl === 7 ? 'Crown Plunger' : lvl === 6 ? 'Sewer Sheriff' : lvl === 5 ? 'Drain Slayer' : lvl >= 3 ? 'Apprentice' : 'Rookie';
export async function techXp(sb, { techId, name }) {
  try {
    let jq = sb.from('jobs').select('id', { count: 'exact', head: true });
    jq = techId ? jq.eq('tech_id', techId) : jq.ilike('tech_name', String(name || ''));
    jq = jq.in('status', ['done', 'complete', 'completed', 'closed']);
    const jobsRes = await jq;
    const jobs = jobsRes.error ? 0 : (jobsRes.count || 0);
    let pts = 0;
    try {
      let gq = sb.from('award_grants').select('points');
      gq = techId ? gq.eq('tech_id', techId) : gq.ilike('tech_name', String(name || ''));
      const g = await gq;
      if (!g.error) pts = (g.data || []).reduce((s, r) => s + (Number(r.points) || 0), 0);
    } catch (_) {}
    const xp = Math.max(0, jobs * 10 + pts);
    const level = Math.max(1, Math.min(10, Math.floor(xp / XP_PER_LEVEL) + 1));
    const into = xp - (level - 1) * XP_PER_LEVEL;
    const pct = level >= 10 ? 100 : Math.min(100, Math.round((into / XP_PER_LEVEL) * 100));
    return { available: true, xp, level, pct, tier: TIER(level), nextAt: level * XP_PER_LEVEL };
  } catch { return { available: false }; }
}
const nyDayKeyOf = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(iso));

// On-time streak — consecutive recent WORKING days where every job the tech started was on time
// (started_at ≤ scheduled_at + 5 min grace). Real data from jobs; guarded + fail-soft.
export async function onTimeStreak(sb, { techId, name }, nowMs) {
  try {
    const since = new Date((Number.isFinite(nowMs) ? nowMs : 0) - 30 * 86400000).toISOString();
    let q = sb.from('jobs').select('tech_id, tech_name, scheduled_at, started_at').gte('scheduled_at', since);
    if (techId) q = q.eq('tech_id', techId); else if (name) q = q.ilike('tech_name', String(name));
    else return { available: true, streak: 0 };
    const { data, error } = await q;
    if (error) return { available: false };
    const days = new Map(); // NY dayKey → all-on-time so far that day?
    for (const j of (data || [])) {
      if (!j.scheduled_at || !j.started_at) continue;
      const k = nyDayKeyOf(j.scheduled_at);
      const onTime = Date.parse(j.started_at) <= Date.parse(j.scheduled_at) + 5 * 60000;
      days.set(k, days.has(k) ? (days.get(k) && onTime) : onTime);
    }
    if (!days.size) return { available: true, streak: 0 };
    const keys = [...days.keys()].sort().reverse(); // newest working day first
    let streak = 0;
    for (const k of keys) { if (days.get(k)) streak++; else break; }
    return { available: true, streak };
  } catch { return { available: false }; }
}

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
