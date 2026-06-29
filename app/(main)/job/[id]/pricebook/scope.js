import { canViewJob, loadJob } from '../jobAccess';

// 🔒 Cross-job guard for the pricebook server actions.
//
// The local ctx() helpers in this folder only check ROLE (is the caller a tech / can they sell) — they
// NEVER verify the caller owns THIS job. Because the service-role client bypasses RLS, that left a hole:
// any signed-in tech could record a sale, forge a verbal approval, or write money/usage rows against
// ANOTHER tech's estimate just by passing a foreign jobId or estimate token (commission misattribution +
// forged customer consent). This mirrors the cockpit's getActionContext: load the job, run canViewJob.
//
// Pass the ctx() result `c` ({ user, profile, sb }) and the job id. Returns { job } on success or
// { err } to bubble straight back to the client. A null/blank jobId is treated as "no job to scope" by
// callers that legitimately allow job-less writes (they guard before calling).
export async function scopeJob(c, jobId) {
  if (!jobId) return { err: 'No job specified.' };
  const { data: job, error } = await loadJob(c.sb, jobId);
  if (error || !job) return { err: 'Job not found.' };
  if (!(await canViewJob(c.sb, c.user, c.profile, c.profile?.role, job))) return { err: 'Not allowed for this job.' };
  return { job };
}
