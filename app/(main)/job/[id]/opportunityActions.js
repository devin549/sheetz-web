'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { canUploadPhotos } from './jobAccess';

const clean = (v, n = 300) => String(v == null ? '' : v).trim().slice(0, n);

// 📌 Tech flags AI "Check my notes" recommendations as follow-up OPPORTUNITIES — work the customer should do
// but didn't today. Saved against the customer so the office can win it back later (board + campaign). The
// tech's flag is the first gate; the office's approval to SEND is the second (campaign approver).
export async function flagOpportunities(jobId, items) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!canUploadPhotos(profile.role)) return { ok: false, msg: 'Your role can’t flag follow-ups.' };
  const list = (Array.isArray(items) ? items : []).map((it) => ({ title: clean(it.title, 160), detail: clean(it.detail, 400) })).filter((it) => it.title);
  if (!list.length) return { ok: false, msg: 'Pick at least one to flag.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };

  let customerId = null;
  try { const { data: j } = await sb.from('jobs').select('customer_id').eq('id', jobId).maybeSingle(); customerId = j?.customer_id || null; } catch (_) {}
  if (!customerId) return { ok: false, msg: 'No customer on this job to attach a follow-up to.' };

  // Skip ones already flagged-open for this job (don't double-list the same recommendation).
  let existing = new Set();
  try { const { data } = await sb.from('opportunities').select('title').eq('job_id', jobId).eq('status', 'open'); (data || []).forEach((o) => existing.add(String(o.title || '').toLowerCase())); } catch (_) {}
  const rows = list.filter((it) => !existing.has(it.title.toLowerCase())).map((it) => ({
    customer_id: customerId, job_id: jobId || null, kind: 'recommendation', source: 'ai_work_summary',
    title: it.title, detail: it.detail || null, status: 'open', created_by: user.id, created_by_name: profile.name || user.email,
  }));
  if (!rows.length) return { ok: true, msg: 'Already flagged for follow-up.' };

  const { error } = await sb.from('opportunities').insert(rows);
  if (error) return { ok: false, msg: /relation|column|schema cache|does not exist/i.test(error.message || '') ? 'Run supabase/159_opportunities.sql first.' : error.message };
  try { await sb.from('audit_log').insert({ actor_id: user.id, actor_name: profile.name || user.email, role: profile.role, action: 'opportunity.flagged', entity: 'customer', entity_id: String(customerId), detail: { job_id: jobId, count: rows.length, titles: rows.map((r) => r.title) } }); } catch (_) {}
  revalidatePath(`/job/${jobId}`);
  return { ok: true, msg: `📌 ${rows.length} flagged for follow-up — the office can win it back later.` };
}
