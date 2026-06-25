// Start-of-Day briefing data — the tech's last-shift scorecard, company rankings, today's enriched jobs,
// and the one-line win condition. All real signal from `jobs` (+ QA/corrections); every loader is guarded
// and fail-soft (returns {available:false} rather than throwing) so the briefing never blocks the shift.
import { nyWeekWindow } from '@/lib/leaderboard';
import { loadCloseoutBatch } from '@/lib/qa';
import { deriveTags } from '@/lib/jobTags';

const isDone = (s) => /done|complete|closed/.test(String(s || '').toLowerCase());
const isCancel = (s) => /cancel/.test(String(s || '').toLowerCase());
const isEstimateClass = (j) => String(j.job_class || '').toLowerCase() === 'estimate' || /estimate|quote|bid/.test(String(j.job_type || '').toLowerCase());
const soldEstimate = (j) => !!j.converted_to_job_id || /sold|won|accepted|converted/i.test(String(j.estimate_outcome || ''));
const onTime = (j) => j.scheduled_at && j.started_at && Date.parse(j.started_at) <= Date.parse(j.scheduled_at) + 5 * 60000;
const GRACE = 5 * 60000;

function nyDayKey(d) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d || new Date()); }
function nyWindow(dateStr) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' }).formatToParts(new Date(dateStr + 'T12:00:00Z')).find((p) => p.type === 'timeZoneName');
  const m = (part?.value || 'GMT-5').match(/GMT([+-]\d{1,2})(?::(\d{2}))?/); const h = m ? parseInt(m[1], 10) : -5;
  const off = h * 60 + (h < 0 ? -1 : 1) * parseInt((m && m[2]) || '0', 10);
  const startMs = Date.parse(dateStr + 'T00:00:00Z') - off * 60000;
  return { startISO: new Date(startMs).toISOString(), endISO: new Date(startMs + 86400000).toISOString() };
}
function scopeQ(q, ident) {
  if (ident.techId) return q.eq('tech_id', ident.techId);
  const ors = [];
  if (ident.email) ors.push(`tech_email.eq.${ident.email}`);
  if (ident.name) ors.push(`tech_name.ilike.%${ident.name}%`);
  return ors.length ? q.or(ors.join(',')) : q.eq('id', '00000000-0000-0000-0000-000000000000');
}

// ── Last worked day: most recent NY day < today that has a job for this tech ──────────────────────────
export async function lastWorkedDay(sb, ident, nowMs) {
  try {
    const todayKey = nyDayKey(new Date(nowMs));
    const since = new Date(nowMs - 45 * 86400000).toISOString();
    const before = new Date(nowMs).toISOString();
    const { data, error } = await scopeQ(
      sb.from('jobs').select('scheduled_at').gte('scheduled_at', since).lt('scheduled_at', before).order('scheduled_at', { ascending: false }).limit(80),
      ident
    );
    if (error) return { available: false };
    for (const j of (data || [])) {
      const k = nyDayKey(new Date(j.scheduled_at));
      if (k < todayKey) {
        const daysOff = Math.round((Date.parse(todayKey + 'T12:00:00Z') - Date.parse(k + 'T12:00:00Z')) / 86400000) - 1;
        return { available: true, dayKey: k, daysOff: Math.max(0, daysOff) };
      }
    }
    return { available: true, dayKey: null, daysOff: 0 }; // first shift / nothing prior
  } catch { return { available: false }; }
}

// ── Last-shift scorecard ──────────────────────────────────────────────────────────────────────────────
export async function lastShiftScorecard(sb, ident, dayKey) {
  if (!dayKey) return { available: false };
  try {
    const { startISO, endISO } = nyWindow(dayKey);
    const { data, error } = await scopeQ(
      sb.from('jobs').select('id, job_type, job_class, amount, status, scheduled_at, started_at, estimate_outcome, converted_to_job_id')
        .gte('scheduled_at', startISO).lt('scheduled_at', endISO),
      ident
    );
    if (error) return { available: false };
    const all = (data || []).filter((j) => !isCancel(j.status));
    const done = all.filter((j) => isDone(j.status));
    const revenue = done.reduce((s, j) => s + (Number(j.amount) || 0), 0);
    const jobs = done.length;
    const started = all.filter((j) => j.started_at);
    const onTimePct = started.length ? Math.round((started.filter(onTime).length / started.length) * 100) : null;
    const estimates = all.filter(isEstimateClass);
    const conversion = estimates.length ? Math.round((estimates.filter(soldEstimate).length / estimates.length) * 100) : null;

    // QA + closeout from the photo spine (fail-soft → those fields just go null/0).
    let photoQa = { pass: 0, fail: 0 }, closeoutPct = null, callbacks = 0;
    try {
      const co = await loadCloseoutBatch(sb, all.map((j) => ({ id: j.id, job_type: j.job_type })));
      let closedReady = 0, scored = 0;
      done.forEach((j) => { const c = co[j.id]; if (c && c.available !== false) { scored++; if (c.readyToClose) closedReady++; photoQa.fail += (c.openFails || 0); photoQa.pass += Math.max(0, (c.photoCount || 0) - (c.openFails || 0)); } });
      closeoutPct = scored ? Math.round((closedReady / scored) * 100) : null;
    } catch (_) {}
    try {
      const ids = all.map((j) => String(j.id));
      if (ids.length) { const c = await sb.from('job_corrections').select('id').eq('status', 'open').in('orig_job_id', ids); callbacks = c.error ? 0 : (c.data || []).length; }
    } catch (_) {}

    return {
      available: true, dayKey, revenue, jobs,
      avgTicket: jobs ? Math.round(revenue / jobs) : null,
      conversion, estimates: estimates.length,
      onTimePct, reviewRating: null, // review feed not wired yet
      photoQa, callbacks, partsMisses: null, closeoutPct,
    };
  } catch { return { available: false }; }
}

// ── Company rankings (this pay-week) — per-metric rank among all techs with jobs this week ─────────────
function rankOf(map, key, who, dir = 'desc') {
  const arr = [...map.values()].filter((r) => r._has[key]).sort((a, b) => dir === 'desc' ? b[key] - a[key] : a[key] - b[key]);
  const i = arr.findIndex((r) => r.who === who);
  return i < 0 ? { rank: null, total: arr.length, value: null } : { rank: i + 1, total: arr.length, value: arr[i][key] };
}
export async function companyRankings(sb, ident, nowMs) {
  try {
    const { startISO, endISO } = nyWeekWindow(new Date(nowMs));
    const { data, error } = await sb.from('jobs')
      .select('id, tech_name, job_type, job_class, amount, status, scheduled_at, started_at, estimate_outcome, converted_to_job_id, techs(name)')
      .gte('scheduled_at', startISO).lt('scheduled_at', endISO);
    if (error) return { available: false };
    const rows = (data || []).filter((j) => !isCancel(j.status));
    const norm = (s) => String(s || '').trim().toLowerCase();
    const meName = norm(ident.name);
    const by = new Map(); // who → aggregate
    const ensure = (who) => { if (!by.has(who)) by.set(who, { who, revenue: 0, jobs: 0, started: 0, onTimeN: 0, est: 0, sold: 0, fails: 0, callbacks: 0, _has: {} }); return by.get(who); };
    for (const j of rows) {
      const who = norm((j.techs && j.techs.name) || j.tech_name);
      if (!who) continue;
      const a = ensure(who);
      if (isDone(j.status)) { a.revenue += Number(j.amount) || 0; a.jobs += 1; }
      if (j.started_at) { a.started += 1; if (onTime(j)) a.onTimeN += 1; }
      if (isEstimateClass(j)) { a.est += 1; if (soldEstimate(j)) a.sold += 1; }
    }
    // QA fails + callbacks per tech (bounded; skip if the week is huge to stay fast).
    if (rows.length && rows.length <= 400) {
      try {
        const co = await loadCloseoutBatch(sb, rows.map((j) => ({ id: j.id, job_type: j.job_type })));
        const techOf = new Map(rows.map((j) => [String(j.id), norm((j.techs && j.techs.name) || j.tech_name)]));
        for (const [id, c] of Object.entries(co)) { const who = techOf.get(id); if (who && by.has(who) && c) by.get(who).fails += (c.openFails || 0); }
      } catch (_) {}
      try {
        const ids = rows.map((j) => String(j.id));
        const c = await sb.from('job_corrections').select('orig_job_id').eq('status', 'open').in('orig_job_id', ids);
        if (!c.error) { const techOf = new Map(rows.map((j) => [String(j.id), norm((j.techs && j.techs.name) || j.tech_name)])); (c.data || []).forEach((x) => { const who = techOf.get(String(x.orig_job_id)); if (who && by.has(who)) by.get(who).callbacks += 1; }); }
      } catch (_) {}
    }
    // derive + flag which metrics each tech has data for
    for (const a of by.values()) {
      a.avgTicket = a.jobs ? a.revenue / a.jobs : 0;
      a.onTimePct = a.started ? (a.onTimeN / a.started) * 100 : 0;
      a.conversion = a.est ? (a.sold / a.est) * 100 : 0;
      a.callbackRate = a.jobs ? a.callbacks / a.jobs : 0; // lower better
      a._has = { revenue: a.jobs > 0, avgTicket: a.jobs > 0, onTimePct: a.started > 0, conversion: a.est > 0, fails: a.jobs > 0, callbackRate: a.jobs > 0 };
    }
    if (!by.has(meName) && ident.name) ensure(meName); // me with no jobs still gets a (null) rank
    const m = {
      revenue: rankOf(by, 'revenue', meName, 'desc'),
      avgTicket: rankOf(by, 'avgTicket', meName, 'desc'),
      onTime: rankOf(by, 'onTimePct', meName, 'desc'),
      conversion: rankOf(by, 'conversion', meName, 'desc'),
      photoQa: rankOf(by, 'fails', meName, 'asc'),       // fewest fails wins
      callback: rankOf(by, 'callbackRate', meName, 'asc'), // fewest callbacks wins
    };
    return { available: true, overall: m.revenue, metrics: m, fieldSize: by.size };
  } catch { return { available: false }; }
}

// ── Today's briefing: enrich each job with opportunity / risk / tools / best action ───────────────────
const TOOLS_BY_TYPE = [
  [/water ?heater|tankless/, ['Tubing cutter', 'Pro-Press', 'Flex connectors', 'T&P valve', 'Combustion analyzer']],
  [/drain|clog|snake|sewer|rooter/, ['K-60 / drum machine', 'Closet auger', 'Camera + locator', 'Nitrile gloves']],
  [/toilet|reset|wax/, ['Wax ring + bolts', 'Closet auger', 'Supply line', 'Caulk']],
  [/faucet|fixture|sink/, ['Basin wrench', 'Supply lines', 'Plumber\'s putty', 'Cartridge kit']],
  [/repipe|main|excavat|dig/, ['Pipe wrench set', 'PEX expander', 'Shovel', 'Helper + 2nd truck']],
  [/gas|furnace|boiler/, ['Combustion analyzer', 'Gas leak detector', 'Pipe dope', 'Manometer']],
];
export function suggestTools(jobType) {
  const t = String(jobType || '').toLowerCase();
  const hit = TOOLS_BY_TYPE.find(([re]) => re.test(t));
  return hit ? hit[1] : ['Standard hand tools', 'Camera', 'Supply lines'];
}
function expectedOpportunity(job) {
  const amt = Number(job.amount) || 0;
  if (amt >= 2500) return { label: 'Big ticket — present good/better/best', tone: 'gold' };
  if (isEstimateClass(job)) return { label: 'Estimate — close it on the spot', tone: 'gold' };
  if (/water ?heater|repipe|reline|sewer|main/.test(String(job.job_type || '').toLowerCase())) return { label: 'Upgrade/replacement opportunity', tone: 'gold' };
  if (amt > 0) return { label: `~${'$' + amt.toLocaleString()} on the board`, tone: 'green' };
  return { label: 'Diagnose + quote two options', tone: 'green' };
}
function bestNextAction(job, tags) {
  if (tags.some((t) => t.key === 'callback')) return 'Callback — make it right, water-test twice, document it.';
  if (tags.some((t) => t.key === 'pastdue')) return 'Collect the balance before new work, then proceed.';
  if (isEstimateClass(job)) return 'Walk the options, set the outcome, ask for the yes.';
  if ((Number(job.amount) || 0) >= 2500) return 'Slow down — present three options, protect the margin.';
  return 'Two options before tools; shoot before/after; close it clean.';
}
export function enrichTodayJob(job, ctx = {}) {
  const tags = deriveTags(job, ctx).slice(0, 4);
  return {
    opportunity: expectedOpportunity(job),
    risks: tags.filter((t) => ['red', 'orange'].includes(t.tone)),
    flags: tags,
    tools: suggestTools(job.job_type),
    bestAction: bestNextAction(job, tags),
  };
}

// ── One-line win condition built from the real gaps ───────────────────────────────────────────────────
export function winCondition(scorecard, rankings) {
  const parts = [];
  const sc = scorecard || {};
  parts.push('keeping your average ticket above $650');           // the money bar
  parts.push('sending complete proof on every job');              // proof always
  if (sc.onTimePct != null && sc.onTimePct < 95) parts.push('hitting every window on time');
  else parts.push('landing 2 fresh reviews');
  return `Win today by ${parts.slice(0, 3).join(', ')}.`;
}
