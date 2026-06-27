'use server';

// Shop after-hours SELF-CHECKOUT (Devin shop-sheet design) — when Reed isn't at the counter, a field tech
// pulls their own material. ALWAYS-ALLOW + FLAG: any active field user can self-issue, but it's stamped as
// a self-pull pending Reed's review (cost hits the JOB#, never tech pay). Writes to shop_issues like the
// office counter, but marked so Reed can audit. No new table.
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { revalidatePath } from 'next/cache';

const clean = (v, n) => String(v ?? '').trim().slice(0, n);

export async function shopSelfCheckout(formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await loadProfile(user) : null;
  if (!user || !profile || profile.active === false) return { ok: false, msg: 'Not signed in.' };
  // Field crew + anyone who can work jobs. (Always-allow per the self-pull decision.)
  if (!(can(profile.role, 'changeStatus') || can(profile.role, 'seeOwnOnly') || can(profile.role, 'seeCrew') || can(profile.role, 'manageInventory'))) {
    return { ok: false, msg: 'Your role can’t pull shop material.' };
  }
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };

  const job_id = clean(formData.get('job_id'), 40);
  const item_name = clean(formData.get('item_name'), 120);
  if (!job_id) return { ok: false, msg: 'Which JOB# does this material go on?' };
  if (!item_name) return { ok: false, msg: 'What did you grab?' };
  const qty = Math.max(1, Number(formData.get('qty')) || 1);
  const unit_cost_cents = Math.round((Number(formData.get('unit_cost')) || 0) * 100);
  const who = profile.name || user.email;

  const row = {
    job_id, item_name, sku: clean(formData.get('sku'), 60) || null,
    qty, unit: 'ea', unit_cost_cents, total_cost_cents: unit_cost_cents * qty,
    kind: 'issue', status: 'out', issued_to: who, issued_by: who,
    // 🔎 self-pull marker so Reed can review every after-hours grab in the shop ledger.
    note: `🔎 SELF-PULL (after-hours) — pending Reed review${clean(formData.get('note'), 200) ? ' · ' + clean(formData.get('note'), 200) : ''}`,
  };
  const { error } = await sb.from('shop_issues').insert(row);
  if (error) return { ok: false, msg: /relation|does not exist|schema cache/i.test(error.message || '') ? 'Run supabase/46_shop_issues.sql first.' : error.message };
  revalidatePath('/my-truck'); revalidatePath('/shop');
  return { ok: true, msg: `✓ ${qty}× ${item_name} → job #${job_id}. Reed will see this self-pull.` };
}
