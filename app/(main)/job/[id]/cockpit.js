import { notFound } from 'next/navigation';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import { canViewJob, loadJob } from './jobAccess';

// Shared loader for every Job Cockpit tab — guard + load the ONE selected job (scoped to the tech).
export async function loadCockpit(id) {
  const { user, role, profile } = await requirePerm('seeAllJobs', 'seeQueue', 'seeOwnOnly', 'seeCrew');
  if (!isAdminConfigured) return { configured: false };
  const sb = getSupabaseAdmin();
  const { data: job, error } = await loadJob(sb, id);
  if (error || !job) notFound();
  if (!(await canViewJob(sb, user, profile, role, job))) notFound();
  return { configured: true, user, role, profile, sb, job, customer: job.customers || {} };
}
