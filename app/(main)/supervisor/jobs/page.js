import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import { loadCloseoutBatch } from '@/lib/qa';
import { statusKey } from '../../board/boardTokens';
import SupervisorList from './SupervisorList';

export const dynamic = 'force-dynamic';

// Eastern-day windows (same model the board uses).
function nyOffsetMinutes(d) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' })
    .formatToParts(d).find((p) => p.type === 'timeZoneName');
  const m = (part?.value || 'GMT-5').match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);
  if (!m) return -300;
  const h = parseInt(m[1], 10);
  return h * 60 + (h < 0 ? -1 : 1) * parseInt(m[2] || '0', 10);
}
function nyTodayStr() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()); }
function nyDayWindow(dateStr) {
  const off = nyOffsetMinutes(new Date(Date.parse(dateStr + 'T12:00:00Z')));
  const startMs = Date.parse(dateStr + 'T00:00:00Z') - off * 60000;
  return { startISO: new Date(startMs).toISOString(), endISO: new Date(startMs + 86400000).toISOString() };
}

export default async function SupervisorJobs({ searchParams }) {
  await requirePerm('qaReview'); // FS / foreman / GM / owner

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">QA / Closeouts</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel to review jobs.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(searchParams?.date || '') ? searchParams.date : nyTodayStr();
  const { startISO, endISO } = nyDayWindow(dateStr);

  const run = (extra) => sb.from('jobs')
    .select('id, status, scheduled_at, tech_id' + extra + ', customers(name, address, phone), techs(name)')
    .gte('scheduled_at', startISO).lt('scheduled_at', endISO)
    .order('scheduled_at', { ascending: true });
  let res = await run(', job_number, job_type, amount, tech_name');
  if (res.error && /column .* does not exist/i.test(res.error.message || '')) res = await run('');
  const raw = (res.data || []).filter((j) => !String(j.status || '').toLowerCase().includes('cancel'));

  const closeout = await loadCloseoutBatch(sb, raw.map((j) => ({ id: j.id, job_type: j.job_type })));
  const jobs = raw.map((j) => ({
    id: j.id, customer: (j.customers && j.customers.name) || 'Customer', address: (j.customers && j.customers.address) || '',
    phone: (j.customers && j.customers.phone) || '', job_number: j.job_number || '', job_type: j.job_type || '',
    status: j.status, statusKey: statusKey(j.status), scheduledISO: j.scheduled_at,
    tech: j.tech_name || (j.techs && j.techs.name) || 'Unassigned', co: closeout[j.id] || {},
  }));

  return <SupervisorList jobs={jobs} dateStr={dateStr} today={nyTodayStr()} />;
}
