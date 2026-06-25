import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import { loadCloseoutBatch } from '@/lib/qa';
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
  if (profile.tech_id) {
    const jr = await sb.from('jobs').select('id, status, job_type').eq('tech_id', profile.tech_id).gte('scheduled_at', startISO).lt('scheduled_at', endISO);
    const todays = jr.data || [];
    summary.unresolved = todays.filter((j) => !/done|complete|closed|cancel/.test(String(j.status || '').toLowerCase())).length;
    const co = await loadCloseoutBatch(sb, todays.map((j) => ({ id: j.id, job_type: j.job_type })));
    todays.forEach((j) => { const c = co[j.id] || {}; if ((c.openFails || 0) > 0) summary.failedQa += c.openFails; if (c.available !== false && !c.readyToClose) summary.missingMedia += 1; });
    // open corrections on today's jobs
    if (todays.length) {
      const { data: corr } = await sb.from('job_corrections').select('id').eq('status', 'open').in('orig_job_id', todays.map((j) => String(j.id)));
      summary.corrections = (corr || []).length;
    }
    const tr = await sb.from('jobs').select('id', { count: 'exact', head: true }).eq('tech_id', profile.tech_id).gte('scheduled_at', tw.startISO).lt('scheduled_at', tw.endISO);
    tomorrowCount = tr.count || 0;
  }

  let saved = null;
  try { const { data } = await sb.from('tech_shift_log').select('checklist, ready, notes').eq('user_id', user.id).eq('day_key', today).eq('kind', 'eod').maybeSingle(); saved = data || null; } catch (_) {}

  return <EndOfDay name={name} summary={summary} tomorrowCount={tomorrowCount} saved={saved} />;
}
