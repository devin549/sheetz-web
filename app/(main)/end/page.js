import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import { loadCloseoutBatch } from '@/lib/qa';
import { scopeToTech } from '@/lib/techJobScope';
import EndOfDay from './EndOfDay';

export const dynamic = 'force-dynamic';

function nyDayKey(d) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d || new Date()); }
function nyWindow(dateStr) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' }).formatToParts(new Date(dateStr + 'T12:00:00Z')).find((p) => p.type === 'timeZoneName');
  const m = (part?.value || 'GMT-5').match(/GMT([+-]\d{1,2})(?::(\d{2}))?/); const h = m ? parseInt(m[1], 10) : -5;
  const off = h * 60 + (h < 0 ? -1 : 1) * parseInt((m && m[2]) || '0', 10);
  const startMs = Date.parse(dateStr + 'T00:00:00Z') - off * 60000;
  return { startISO: new Date(startMs).toISOString(), endISO: new Date(startMs + 86400000).toISOString() };
}

export default async function End() {
  const { user, profile } = await requirePerm('changeStatus', 'seeOwnOnly', 'seeCrew');
  const name = profile.name || user.email;
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">🌙 End of Day</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  const sb = getSupabaseAdmin();
  const today = nyDayKey();
  const { startISO, endISO } = nyWindow(today);
  const tmrw = nyDayKey(new Date(Date.now() + 86400000));
  const tw = nyWindow(tmrw);

  let summary = { unresolved: 0, failedQa: 0, missingMedia: 0, corrections: 0 };
  let tomorrowCount = 0;
  let eodStats = { closed: 0, earned: 0, openItems: 0 };
  {
    // tech_id link, or name/email fallback for techs not linked to a roster row (mirrors My Day).
    const jr = await scopeToTech(sb.from('jobs').select('id, status, job_type, amount').gte('scheduled_at', startISO).lt('scheduled_at', endISO), { profile, user });
    const todays = jr.data || [];
    summary.unresolved = todays.filter((j) => !/done|complete|closed|cancel/.test(String(j.status || '').toLowerCase())).length;
    const closedJobs = todays.filter((j) => /done|complete|closed/.test(String(j.status || '').toLowerCase()));
    eodStats.closed = closedJobs.length;
    eodStats.earned = closedJobs.reduce((s, j) => s + (Number(j.amount) || 0), 0);
    const co = await loadCloseoutBatch(sb, todays.map((j) => ({ id: j.id, job_type: j.job_type })));
    todays.forEach((j) => { const c = co[j.id] || {}; if ((c.openFails || 0) > 0) summary.failedQa += c.openFails; if (c.available !== false && !c.readyToClose) summary.missingMedia += 1; });
    // open corrections on today's jobs
    if (todays.length) {
      const { data: corr } = await sb.from('job_corrections').select('id').eq('status', 'open').in('orig_job_id', todays.map((j) => String(j.id)));
      summary.corrections = (corr || []).length;
    }
    const tr = await scopeToTech(sb.from('jobs').select('id', { count: 'exact', head: true }).gte('scheduled_at', tw.startISO).lt('scheduled_at', tw.endISO), { profile, user });
    tomorrowCount = tr.count || 0;
  }

  let saved = null;
  try { const { data } = await sb.from('tech_shift_log').select('checklist, ready, notes').eq('user_id', user.id).eq('day_key', today).eq('kind', 'eod').maybeSingle(); saved = data || null; } catch (_) {}

  // EOD gate row (shared sod_checks). Fail-soft pre-92/93.
  let sodRow = null;
  try { const q = profile.tech_id ? await sb.from('sod_checks').select('*').eq('tech_id', profile.tech_id).eq('day', today).maybeSingle() : await sb.from('sod_checks').select('*').eq('tech_name', name).eq('day', today).maybeSingle(); sodRow = q.data || null; } catch (_) {}
  eodStats.openItems = summary.unresolved + summary.failedQa + summary.missingMedia + summary.corrections;

  return <EndOfDay name={name} summary={summary} tomorrowCount={tomorrowCount} saved={saved} eodGate={{ sod: sodRow || {}, stats: eodStats }} />;
}
