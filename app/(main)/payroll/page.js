import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireRole } from '@/lib/guard';
import { nyTodayStr } from '@/lib/day';
import PayrollClient from './PayrollClient';
import PendingSubs from './PendingSubs';

export const dynamic = 'force-dynamic';

const addDays = (d, n) => { const [y, m, day] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10); };
const sundayOf = (d) => { const [y, m, day] = d.split('-').map(Number); const dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay(); return addDays(d, -dow); };

export default async function Payroll({ searchParams }) {
  const { role } = await requireRole(['owner', 'admin', 'gm', 'om', 'accounting']);

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Payroll Run</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const week = /^\d{4}-\d{2}-\d{2}$/.test(searchParams?.week || '') ? sundayOf(searchParams.week) : sundayOf(nyTodayStr());
  const weekEnd = addDays(week, 6);

  const runRes = await sb.from('cb_payroll_runs').select('id, status, week_start, week_end, created_by, approved_by, approved_at').eq('week_start', week).maybeSingle();
  if (runRes.error && /could not find|does not exist|schema cache/i.test(runRes.error.message || '')) {
    return <div className="wrap"><div className="h1">Payroll Run</div><div className="notice">Payroll needs its tables — run <code>supabase/31_payroll.sql</code> in Supabase, then set pay rates and generate a week.</div></div>;
  }
  const run = runRes.data || null;

  let lines = [];
  if (run) {
    const BASE = 'id, tech_id, tech_name, pay_type, jobs_count, revenue_cents, commission_cents, hours, hourly_cents, bonus_cents, adjust_cents, note';
    let { data, error } = await sb.from('cb_payroll_lines').select(BASE + ', holiday_cents, dock_cents, pto_note').eq('run_id', run.id);
    if (error && /holiday_cents|dock_cents|pto_note|column|schema cache/i.test(error.message || '')) ({ data } = await sb.from('cb_payroll_lines').select(BASE).eq('run_id', run.id)); // pre-160
    lines = data || [];
  }

  const { data: techsData } = await sb.from('techs').select('id, name').order('name');
  const techs = techsData || [];
  const { data: pays } = await sb.from('pay_profiles').select('tech_id, pay_type, commission_pct, hourly_rate, weekly_salary');
  const payByTech = {}; (pays || []).forEach((p) => { payByTech[p.tech_id] = p; });

  // 👷 Subcontractor costs awaiting Accounting verification (any open pending sub) — verify here → finalizes in pay.
  let pendingSubs = [];
  try {
    const { data } = await sb.from('jobs').select('id, job_number, sub_cost_cents, sub_vendor, tech_name, customers(name)')
      .gt('sub_cost_cents', 0).eq('sub_verified', false).order('scheduled_at', { ascending: false }).limit(50);
    pendingSubs = data || [];
  } catch (_) {}

  return (
    <>
      {pendingSubs.length > 0 && <div className="wrap" style={{ paddingBottom: 0 }}><PendingSubs subs={pendingSubs} /></div>}
    <PayrollClient
      week={week} weekEnd={weekEnd} today={sundayOf(nyTodayStr())}
      prevWeek={addDays(week, -7)} nextWeek={addDays(week, 7)}
      run={run} lines={lines} techs={techs} payByTech={payByTech}
      canApprove={['owner', 'admin', 'gm', 'om'].includes(String(role).toLowerCase())}
    />
    </>
  );
}
