// Territory intelligence — learn the cities CB works in from the jobs themselves, track volume + trend, and
// feed the rank/competitor scans the places we actually operate. Pure-ish (takes a supabase admin client).
export const MIN_JOBS_TO_WATCH = 5;   // jobs in 30 days for a city to become a watched territory
export const VOLUME_ALERT_PCT = 10;   // ± % month-over-month swing that flags an alert

const titleCase = (s) => String(s || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).trim();

// Pull a "City" out of a job (structured column → parse from address → customer fields). KY-focused.
export function cityOf(job) {
  const tryParse = (addr) => { const m = String(addr || '').match(/([A-Za-z][A-Za-z .'-]+?),\s*(?:KY|Kentucky)\b/i); return m ? titleCase(m[1]) : ''; };
  const c = job.city || (job.customers && job.customers.city);
  if (c) return titleCase(c);
  return tryParse(job.address) || tryParse(job.customers && job.customers.address) || '';
}

// Aggregate jobs (last ~60d) into per-city volume: last 30d vs prior 30d + % change + watched flag.
export function aggregateTerritory(jobs, { minJobs = MIN_JOBS_TO_WATCH, now = Date.now() } = {}) {
  const cut30 = now - 30 * 86400000, cut60 = now - 60 * 86400000;
  const by = {};
  for (const j of jobs) {
    const city = cityOf(j); if (!city) continue;
    const t = Date.parse(j.scheduled_at || j.created_at || ''); if (!t || t < cut60) continue;
    const r = (by[city] = by[city] || { city, jobs30: 0, jobsPrev30: 0 });
    if (t >= cut30) r.jobs30++; else r.jobsPrev30++;
  }
  return Object.values(by).map((r) => {
    const deltaPct = r.jobsPrev30 > 0 ? Math.round(((r.jobs30 - r.jobsPrev30) / r.jobsPrev30) * 100) : (r.jobs30 > 0 ? null : 0);
    return { ...r, deltaPct, watched: r.jobs30 >= minJobs };
  }).sort((a, b) => b.jobs30 - a.jobs30);
}

// The learned watch-list (e.g. ['Richmond, Kentucky', …]) for cities at/over the threshold in the last 30d.
export async function learnedTowns(sb, { minJobs = MIN_JOBS_TO_WATCH } = {}) {
  try {
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data } = await sb.from('jobs').select('city, address, scheduled_at, customers(city, address)').gte('scheduled_at', since).limit(5000);
    const count = {};
    (data || []).forEach((j) => { const c = cityOf(j); if (c) count[c] = (count[c] || 0) + 1; });
    return Object.entries(count).filter(([, n]) => n >= minJobs).map(([c]) => `${c}, Kentucky`);
  } catch { return []; }
}
