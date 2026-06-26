import { notFound, redirect } from 'next/navigation';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import { canAny } from '@/lib/roles';
import { canViewJob, loadJob } from './jobAccess';

// Who may see money/pricing on a job cockpit tab (estimate, prices, invoice). Techs/foremen/office
// qualify; a HELPER does not (no money/pricing anywhere — Devin). Deny-by-default.
export const canSeePricing = (role) => canAny(role, ['collectPayment', 'seeFinancials', 'seeRevenue', 'assignJobs']);

// Shared loader for every Job Cockpit tab — guard + load the ONE selected job (scoped to the tech).
export async function loadCockpit(id) {
  const { user, role, profile } = await requirePerm('seeAllJobs', 'seeQueue', 'seeOwnOnly', 'seeCrew');
  if (!isAdminConfigured) return { configured: false };
  const sb = getSupabaseAdmin();
  const { data: job, error } = await loadJob(sb, id);
  if (error || !job) notFound();
  if (!(await canViewJob(sb, user, profile, role, job))) notFound();
  return { configured: true, user, role, profile, sb, job, customer: job.customers || {}, pricing: canSeePricing(role) };
}

// Money-tab loader: same as loadCockpit but bounces anyone without pricing access (e.g. a helper)
// back to the job overview. Use on the estimate / prices / invoice tabs so the URL can't leak money.
export async function loadCockpitMoney(id) {
  const c = await loadCockpit(id);
  if (c.configured && !c.pricing) redirect(`/job/${id}`);
  return c;
}
