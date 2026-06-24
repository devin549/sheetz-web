'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { revalidatePath } from 'next/cache';

const CATS = ['materials', 'fuel', 'tools', 'permit', 'other'];

async function assertAcct() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  if (!user || !(can(profile.role, 'seeFinancials') || can(profile.role, 'seeReports'))) throw new Error('Not allowed.');
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Server not configured.');
  return { sb, user, profile };
}
const clean = (v, n = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// Save / verify / flag the receipt entry for one receipt photo (upsert keyed on photo_id).
export async function saveReceipt(formData) {
  let ctx; try { ctx = await assertAcct(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const photoId = clean(formData.get('photoId'), 80);
  if (!photoId) return { ok: false, msg: 'No receipt.' };
  const status = ['pending', 'verified', 'flagged'].includes(formData.get('status')) ? formData.get('status') : 'pending';
  const amount = Number(formData.get('amount'));
  const row = {
    photo_id: photoId, job_id: clean(formData.get('jobId'), 80) || null,
    vendor: clean(formData.get('vendor'), 120) || null,
    amount_cents: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null,
    category: CATS.includes(formData.get('category')) ? formData.get('category') : null,
    note: clean(formData.get('note'), 400) || null,
    status,
    reviewed_by: status !== 'pending' ? ctx.user.id : null,
    reviewed_by_name: status !== 'pending' ? (ctx.profile.name || ctx.user.email) : null,
    reviewed_at: status !== 'pending' ? new Date().toISOString() : null,
  };
  const { error } = await ctx.sb.from('receipt_entries').upsert(row, { onConflict: 'photo_id' });
  if (error) {
    if (/could not find|does not exist|schema cache/i.test(error.message || '')) return { ok: false, msg: 'Run supabase/29_receipts.sql first.' };
    return { ok: false, msg: error.message };
  }
  revalidatePath('/receipts');
  return { ok: true, msg: status === 'verified' ? 'Verified.' : status === 'flagged' ? 'Flagged.' : 'Saved.' };
}
