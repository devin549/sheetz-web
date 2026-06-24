import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import { statusKey } from '../board/boardTokens';
import JobRecordsList from './JobRecordsList';

export const dynamic = 'force-dynamic';

export default async function JobRecords() {
  await requirePerm('seeReports', 'seeAllJobs');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Job Records</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();

  const run = (extra) => sb.from('jobs').select('id, status, scheduled_at, tech_id' + extra + ', customers(name, address), techs(name)')
    .order('scheduled_at', { ascending: false }).limit(300);
  let res = await run(', job_number, job_type, amount, tech_name');
  if (res.error && /column .* does not exist/i.test(res.error.message || '')) res = await run('');

  const jobs = (res.data || []).map((j) => ({
    id: j.id, customer: (j.customers && j.customers.name) || 'Customer', address: (j.customers && j.customers.address) || '',
    job_number: j.job_number || '', job_type: j.job_type || '', status: j.status, statusKey: statusKey(j.status),
    amount: Number(j.amount) || 0, scheduledISO: j.scheduled_at, tech: j.tech_name || (j.techs && j.techs.name) || 'Unassigned',
  }));

  return (
    <div className="wrap" style={{ maxWidth: 1000 }}>
      <div className="h1">Job Records</div>
      <p className="muted">Last {jobs.length} jobs · search customer, address, job #, tech, type, status. Click a row for the job file.</p>
      <JobRecordsList jobs={jobs} />
    </div>
  );
}
