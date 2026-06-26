'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { canAny } from '@/lib/roles';

const STATUSES = ['open', 'dismissed', 'recovered', 'rebilled', 'coaching'];

// Manager dispositions a flagged job. Never edits the job — just records what happened + logs it.
export async function reviewLeak(jobId, status, { note = '', reason = '', leakCents = 0 } = {}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!canAny(profile.role, ['seeFinancials', 'seeRevenue'])) return { ok: false, msg: 'Financial access required.' };
  if (!STATUSES.includes(status)) return { ok: false, msg: 'Unknown status.' };
  if (!jobId) return { ok: false, msg: 'Missing job.' };

  const sb = getSupabaseAdmin();
  const row = {
    job_id: String(jobId), status, note: String(note || '').trim().slice(0, 1000),
    reason: String(reason || '').slice(0, 200), leak_cents: Math.max(0, Math.round(Number(leakCents) || 0)),
    reviewed_by: user.id, reviewed_by_name: profile.name || user.email, reviewed_at: new Date().toISOString(),
  };
  const { error } = await sb.from('leak_reviews').upsert(row, { onConflict: 'job_id' });
  if (error) return { ok: false, msg: /relation|column|schema cache|does not exist/i.test(error.message || '') ? 'Run supabase/85_leak_reviews.sql first.' : error.message };
  try { await sb.from('audit_log').insert({ actor_id: user.id, actor_name: profile.name || user.email, role: profile.role, action: 'leak.review', entity: 'job', entity_id: String(jobId), detail: { status, leak_cents: row.leak_cents, reason: row.reason } }); } catch (_) {}
  revalidatePath('/leak-radar');
  return { ok: true };
}
