'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { roleOf } from '@/lib/nav';
import { can } from '@/lib/roles';
import { revalidatePath } from 'next/cache';

// Tech updates a job's status from the iPad in the field (Rolling/En route → On site → Complete).
// Stamps the matching timestamp. Gated to changeStatus (tech/helper-lead/foreman/office).
const VALID = ['scheduled', 'enroute', 'on_site', 'done'];
export async function updateMyJobStatus(jobId, status) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !can(roleOf(user), 'changeStatus')) return { ok: false, msg: 'Your role can’t update job status.' };
  if (!jobId || !VALID.includes(status)) return { ok: false, msg: 'Bad request.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  const patch = { status };
  const nowISO = new Date().toISOString();
  if (status === 'enroute') patch.enroute_at = nowISO;
  if (status === 'on_site') patch.started_at = nowISO;
  if (status === 'done') patch.completed_at = nowISO;
  const { error } = await sb.from('jobs').update(patch).eq('id', jobId);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/my-day');
  return { ok: true };
}
