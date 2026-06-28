'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { canEditPricebookContent } from '@/lib/pricebookEngine';
import { suggestCrossSell } from '@/lib/crossSell';

// Merchandising tool → content editors (owner/admin/gm/om/marketing). RLS is bypassed by the admin client,
// so this in-code gate is the only guard — it runs before any item read or any AI call.
async function ctx() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!canEditPricebookContent(profile.role)) return { err: 'Owner / office / marketing only.' };
  return { user, profile, sb: getSupabaseAdmin() };
}

const byId = (a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);

// 🧠 AI cross-sell seeder — fill "commonly added with this" for items that have no AI picks yet. Cursor by id
// (same shape as the photo backfill) so the client loop walks every needy item exactly once and always
// terminates. Idempotent: an item with existing AI rows is skipped, so re-runs don't re-spend on it. limit:0
// = pure count (no AI spend).
export async function seedRecommendations({ limit, afterId } = {}) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const batch = Math.max(0, Math.min(25, limit == null ? 12 : Number(limit) || 0));

  // The whole active book = both the AI vocabulary AND the universe of targets.
  let items = [];
  try {
    const { data, error } = await c.sb.from('pricebook_items')
      .select('id, name, customer_name, short_description, customer_description')
      .eq('active', true).limit(3000);
    if (error) return { ok: false, msg: /relation|column|schema cache|does not exist/i.test(error.message || '') ? 'Run supabase/104_pricebook.sql first.' : error.message };
    items = (data || []).slice().sort(byId);
  } catch (e) { return { ok: false, msg: String(e?.message || e) }; }

  // Stable index = the AI's vocabulary. idx → id map; idx is the position in the id-sorted catalog.
  const catalog = items.map((it, i) => ({ i, id: it.id, name: it.customer_name || it.name }));
  const idOf = catalog.map((c2) => c2.id);

  // Which items the seeder already TRIED (pass OR no-pick) → skip them. Keying idempotency off "attempted"
  // (not "has recs") means an item with no good pairing is tried ONCE and never re-spends on re-runs, and the
  // "to seed" count can actually reach zero.
  let tried = new Set();
  try {
    const { data, error } = await c.sb.from('pricebook_rec_seeded').select('item_id').limit(20000);
    if (error && /relation|column|schema cache|does not exist/i.test(error.message || '')) return { ok: false, msg: 'Run supabase/128_pricebook_recommendations.sql first.', remaining: items.length };
    (data || []).forEach((r) => tried.add(r.item_id));
  } catch (_) {}

  const needy = items.map((it, i) => ({ ...it, i })).filter((it) => !tried.has(it.id));
  const remainingTotal = needy.length;
  if (batch === 0) return { ok: true, filled: 0, failed: 0, scanned: 0, remaining: remainingTotal, lastId: null, done: remainingTotal === 0 };

  // CURSOR by id — take the next `batch` needy items whose id sorts after afterId (each visited once).
  const cursor = afterId ? String(afterId) : '';
  const windowItems = (cursor ? needy.filter((n) => String(n.id) > cursor) : needy).slice(0, batch);
  if (!windowItems.length) return { ok: true, filled: 0, failed: 0, scanned: 0, remaining: remainingTotal, lastId: null, done: true };

  // Ask the model for picks (validated to real indices inside suggestCrossSell).
  const targets = windowItems.map((it) => ({ i: it.i, name: it.customer_name || it.name, desc: it.short_description || it.customer_description || '' }));
  const picksByIdx = await suggestCrossSell(c.profile.role, catalog, targets);

  let filled = 0, failed = 0;
  const rows = [], tombstones = [];
  for (const it of windowItems) {
    const idxs = Array.isArray(picksByIdx[it.i]) ? picksByIdx[it.i] : [];
    const recIds = idxs.map((n) => idOf[n]).filter((rid) => rid && rid !== it.id);
    if (recIds.length) { filled++; recIds.forEach((rid, k) => rows.push({ item_id: it.id, rec_item_id: rid, source: 'ai', score: recIds.length - k })); }
    else failed++;
    tombstones.push({ item_id: it.id, picks: recIds.length });   // mark EVERY attempted item (pass or no-pick)
  }
  if (rows.length) {
    // Ignore dup (item,rec) pairs so a re-run never errors.
    try { await c.sb.from('pricebook_recommendations').upsert(rows, { onConflict: 'item_id,rec_item_id', ignoreDuplicates: true }); } catch (_) {}
  }
  // Tombstone the whole window so it's never re-attempted (the P1 fix — no re-spend, count reaches 0).
  try { await c.sb.from('pricebook_rec_seeded').upsert(tombstones, { onConflict: 'item_id' }); } catch (_) {}
  const lastId = String(windowItems[windowItems.length - 1].id);
  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: c.profile.name || c.user.email, role: c.profile.role, action: 'pricebook.recs.seed', entity: 'pricebook', entity_id: '', detail: { filled, failed, batch } }); } catch (_) {}
  revalidatePath('/catalog'); revalidatePath('/pricebook-admin');
  // Every window item is now tombstoned (tried), so it leaves the needy set — subtract the whole window.
  return { ok: true, filled, failed, scanned: windowItems.length, remaining: remainingTotal - windowItems.length, lastId, done: windowItems.length < batch };
}
