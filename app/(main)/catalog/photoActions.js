'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { canAny } from '@/lib/roles';
import { findProductPhotos } from '@/lib/serpPhotos';

const BUCKET = 'pricebook-photos';
const clean = (v, n = 400) => String(v == null ? '' : v).trim().slice(0, n);
const isMgr = (r) => canAny(r, ['manageInventory', 'manageUsers', 'seeReports', 'seeFinancials', 'assignJobs']);

async function ctx() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!isMgr(profile.role)) return { err: 'Managers only.' };
  return { user, profile, sb: getSupabaseAdmin() };
}

async function ensureBucket(sb) { try { await sb.storage.createBucket(BUCKET, { public: true }); } catch (_) {} }
async function storeFromUrl(sb, url, itemId) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('Could not fetch image.');
  const type = r.headers.get('content-type') || 'image/jpeg';
  if (!/^image\//.test(type)) throw new Error('Not an image.');
  const bytes = Buffer.from(await r.arrayBuffer());
  if (bytes.length > 12 * 1024 * 1024) throw new Error('Image too large.');
  const ext = (type.split('/')[1] || 'jpg').split(';')[0].replace('jpeg', 'jpg');
  const key = `items/${itemId}/${randomUUID()}.${ext}`;
  await ensureBucket(sb);
  const up = await sb.storage.from(BUCKET).upload(key, bytes, { contentType: type, upsert: true });
  if (up.error) throw new Error(up.error.message);
  return sb.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
}

// 🔎 Search real product photos for an item (Google Shopping via SerpAPI). Returns candidates to pick from.
export async function findItemPhotos(itemId, queryOverride) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err, photos: [] };
  const { data: it } = await c.sb.from('pricebook_items').select('name, customer_name, sku, manufacturer').eq('id', itemId).maybeSingle();
  if (!it) return { ok: false, msg: 'Item not found.', photos: [] };
  const q = clean(queryOverride, 160) || [it.manufacturer, it.customer_name || it.name, it.sku].filter(Boolean).join(' ');
  const r = await findProductPhotos(q, { limit: 8 });
  return { ...r, query: q };
}

// Attach a found photo: re-host it (SerpAPI/Google thumbnails are ephemeral) then set primary_photo_url.
export async function setItemPhotoUrl(itemId, url) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const u = clean(url, 1000); if (!/^https?:\/\//.test(u)) return { ok: false, msg: 'Bad image URL.' };
  let stored; try { stored = await storeFromUrl(c.sb, u, itemId); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const { error } = await c.sb.from('pricebook_items').update({ primary_photo_url: stored }).eq('id', itemId);
  if (error) return { ok: false, msg: error.message };
  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: c.profile.name || c.user.email, role: c.profile.role, action: 'pricebook.item.photo', entity: 'pricebook_item', entity_id: String(itemId), detail: { via: 'serp' } }); } catch (_) {}
  revalidatePath('/catalog');
  return { ok: true, msg: 'Photo set.', url: stored };
}

// ⬆ Upload a custom photo for an item (Devin's own ST art / a real shot).
export async function uploadItemPhoto(formData) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const itemId = clean(formData.get('itemId'), 80);
  const file = formData.get('photo');
  if (!itemId) return { ok: false, msg: 'No item.' };
  if (!file || typeof file.arrayBuffer !== 'function' || !/^image\//.test(file.type || '')) return { ok: false, msg: 'Choose an image.' };
  if (file.size > 12 * 1024 * 1024) return { ok: false, msg: 'Image over 12 MB.' };
  await ensureBucket(c.sb);
  const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const key = `items/${itemId}/${randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const up = await c.sb.storage.from(BUCKET).upload(key, bytes, { contentType: file.type, upsert: true });
  if (up.error) return { ok: false, msg: up.error.message };
  const url = c.sb.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
  const { error } = await c.sb.from('pricebook_items').update({ primary_photo_url: url }).eq('id', itemId);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/catalog');
  return { ok: true, msg: 'Custom photo uploaded.', url };
}
