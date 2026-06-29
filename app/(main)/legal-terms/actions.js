'use server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { LEGAL_KINDS } from '@/lib/estimateTerms';
import { revalidatePath } from 'next/cache';

// Owner edits the attorney language. Owner/admin/GM only (manageUsers). Bumps the version so the change is
// traceable; estimates already signed keep the version they agreed to (stored on the estimate row).
export async function saveLegalTerms(kind, content) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await loadProfile(user) : null;
  if (!user || !profile || !can(profile.role, 'manageUsers')) return { ok: false, msg: 'Only owner / GM can edit legal terms.' };
  if (!LEGAL_KINDS.includes(kind)) return { ok: false, msg: 'Unknown terms section.' };
  const text = String(content || '').trim();
  if (text.length < 20) return { ok: false, msg: 'That looks too short — paste the full terms.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  const version = 'v' + new Date().toISOString().slice(0, 10).replace(/-/g, ''); // e.g. v20260629
  const { error } = await sb.from('legal_terms').upsert({ kind, content: text.slice(0, 20000), version, updated_by: profile.name || user.email, updated_at: new Date().toISOString() }, { onConflict: 'kind' });
  if (error) return { ok: false, msg: /legal_terms|column|schema cache|does not exist/i.test(error.message || '') ? 'Run supabase/142_legal_terms.sql first.' : error.message };
  try { await sb.from('audit_log').insert({ actor_id: user.id, actor_name: profile.name || user.email, role: profile.role, action: 'legal_terms.update', entity: 'legal_terms', entity_id: kind, detail: { version, chars: text.length } }); } catch (_) {}
  revalidatePath('/legal-terms');
  return { ok: true, msg: `Saved — now live as ${version}. New estimates use this immediately.` };
}
