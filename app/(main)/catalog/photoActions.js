'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { canAny } from '@/lib/roles';
import { findProductPhotos, findSimilarPhotos } from '@/lib/serpPhotos';
import sharp from 'sharp';

const BUCKET = 'pricebook-photos';
const clean = (v, n = 400) => String(v == null ? '' : v).trim().slice(0, n);
// Pricebook media = merchandising; keep it to content/office roles. Dropped 'assignJobs' so a foreman/
// dispatcher (who can't even reach the pricebook editor) can't add/delete catalog photos.
const isMgr = (r) => canAny(r, ['manageInventory', 'manageUsers', 'seeReports', 'seeFinancials']);

async function ctx() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!isMgr(profile.role)) return { err: 'Managers only.' };
  return { user, profile, sb: getSupabaseAdmin() };
}

async function ensureBucket(sb) { try { await sb.storage.createBucket(BUCKET, { public: true }); } catch (_) {} }

// Optimize a customer-facing image for the field: resize by asset type, convert to WebP, and keep it under
// ~100KB so it loads instantly on a truck's spotty LTE. Returns the optimized buffer (webp). On ANY failure
// (odd format, sharp error) it returns the ORIGINAL bytes + null ext/type so the caller keeps the original —
// an upload must never hard-fail just because optimization couldn't run.
const IMG_DIMS = { item: [500, 500], gallery: [500, 500], category: [600, 400] };
const MAX_IMG_BYTES = 100 * 1024;
async function processImage(buf, kind = 'item') {
  try {
    const [w, h] = IMG_DIMS[kind] || IMG_DIMS.item;
    const base = sharp(buf, { failOn: 'none' }).rotate().resize(w, h, { fit: 'cover', position: 'attention' });
    for (const q of [80, 70, 60, 50, 40]) {
      const out = await base.clone().webp({ quality: q }).toBuffer();
      if (out.length <= MAX_IMG_BYTES || q === 40) return { buf: out, ext: 'webp', contentType: 'image/webp' };
    }
  } catch (_) { /* fall through — keep the original */ }
  return { buf, ext: null, contentType: null };
}
async function storeFromUrl(sb, url, itemId) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('Could not fetch image.');
  const type = r.headers.get('content-type') || 'image/jpeg';
  if (!/^image\//.test(type)) throw new Error('Not an image.');
  const bytes = Buffer.from(await r.arrayBuffer());
  if (bytes.length > 12 * 1024 * 1024) throw new Error('Image too large.');
  const opt = await processImage(bytes, 'item');
  const ext = opt.ext || (type.split('/')[1] || 'jpg').split(';')[0].replace('jpeg', 'jpg');
  const key = `items/${itemId}/${randomUUID()}.${ext}`;
  await ensureBucket(sb);
  const up = await sb.storage.from(BUCKET).upload(key, opt.buf, { contentType: opt.contentType || type, upsert: true });
  if (up.error) throw new Error(up.error.message);
  return sb.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
}

// 🔎 Search real product photos for an item via SerpAPI. `engine` picks the source (google_shopping default,
// google_images, yandex_images, google_lens). Returns candidates to pick from.
export async function findItemPhotos(itemId, queryOverride, engine) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err, photos: [] };
  const { data: it } = await c.sb.from('pricebook_items').select('name, customer_name, sku, manufacturer').eq('id', itemId).maybeSingle();
  if (!it) return { ok: false, msg: 'Item not found.', photos: [] };
  const q = clean(queryOverride, 160) || [it.manufacturer, it.customer_name || it.name, it.sku].filter(Boolean).join(' ');
  const r = await findProductPhotos(q, { limit: 8, engine: clean(engine, 40) || undefined });
  return { ...r, query: q };
}

// 🔁 "More like this" — reverse-image search on a candidate's url (Lens / Yandex) for sharper alternatives.
export async function findSimilarItemPhotos(imageUrl, engine) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err, photos: [] };
  const r = await findSimilarPhotos(clean(imageUrl, 1000), { limit: 8, engine: clean(engine, 40) || undefined });
  return r;
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
  const bytes = Buffer.from(await file.arrayBuffer());
  const opt = await processImage(bytes, 'item');
  const ext = opt.ext || (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const key = `items/${itemId}/${randomUUID()}.${ext}`;
  const up = await c.sb.storage.from(BUCKET).upload(key, opt.buf, { contentType: opt.contentType || file.type, upsert: true });
  if (up.error) return { ok: false, msg: up.error.message };
  const url = c.sb.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
  const { error } = await c.sb.from('pricebook_items').update({ primary_photo_url: url }).eq('id', itemId);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/catalog'); revalidatePath('/pricebook-admin');
  return { ok: true, msg: 'Custom photo uploaded.', url };
}

// ── Media manager (per item) — the gallery / pdf / video / manufacturer-link rows in pricebook_media ──────
const MEDIA_TYPES = ['photo', 'pdf', 'video', 'manufacturer_link'];

// Load the primary photo + every media row for an item (ordered).
export async function loadItemMedia(itemId) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err, media: [], primary: null };
  const id = clean(itemId, 80); if (!id) return { ok: false, msg: 'No item.', media: [], primary: null };
  let primary = null;
  try { const { data } = await c.sb.from('pricebook_items').select('primary_photo_url').eq('id', id).maybeSingle(); primary = data?.primary_photo_url || null; } catch (_) {}
  let media = [];
  try {
    const { data, error } = await c.sb.from('pricebook_media').select('id, media_type, title, url, customer_visible, sort_order').eq('item_id', id).order('sort_order', { ascending: true }).order('created_at', { ascending: true });
    if (error) { if (/relation|column|schema cache|does not exist/i.test(error.message || '')) return { ok: false, msg: 'Run supabase/104_pricebook.sql first.', media: [], primary }; }
    else media = data || [];
  } catch (_) {}
  return { ok: true, media, primary };
}

// Add a media row. Photos are re-hosted (so SerpAPI/vendor thumbnails never rot); pdf/video/link keep their url.
export async function addItemMedia(itemId, mediaType, url, title, customerVisible) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const id = clean(itemId, 80); const type = clean(mediaType, 30);
  if (!id) return { ok: false, msg: 'No item.' };
  if (!MEDIA_TYPES.includes(type)) return { ok: false, msg: 'Bad media type.' };
  let u = clean(url, 1000);
  if (!/^https?:\/\//.test(u)) return { ok: false, msg: 'Enter a valid https URL.' };
  if (type === 'photo') { try { u = await storeFromUrl(c.sb, u, id); } catch (e) { return { ok: false, msg: String(e.message || e) }; } }
  // Append at the end of the existing order.
  let nextSort = 0;
  try { const { data } = await c.sb.from('pricebook_media').select('sort_order').eq('item_id', id).order('sort_order', { ascending: false }).limit(1); nextSort = ((data && data[0]?.sort_order) || 0) + 1; } catch (_) {}
  const { data, error } = await c.sb.from('pricebook_media').insert({ item_id: id, media_type: type, title: clean(title, 160) || null, url: u, customer_visible: customerVisible !== false, sort_order: nextSort }).select('id, media_type, title, url, customer_visible, sort_order').maybeSingle();
  if (error) return { ok: false, msg: /relation|schema cache|does not exist/i.test(error.message || '') ? 'Run supabase/104_pricebook.sql first.' : error.message };
  revalidatePath('/catalog'); revalidatePath('/pricebook-admin');
  return { ok: true, msg: 'Added.', row: data };
}

// Upload a file as a media row (photo or pdf). Photo bucket re-host; returns the new row.
export async function uploadItemMedia(formData) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const id = clean(formData.get('itemId'), 80);
  const type = clean(formData.get('mediaType'), 30) || 'photo';
  const file = formData.get('file');
  if (!id) return { ok: false, msg: 'No item.' };
  if (!MEDIA_TYPES.includes(type)) return { ok: false, msg: 'Bad media type.' };
  if (!file || typeof file.arrayBuffer !== 'function') return { ok: false, msg: 'Choose a file.' };
  if (file.size > 20 * 1024 * 1024) return { ok: false, msg: 'File over 20 MB.' };
  const okType = type === 'photo' ? /^image\//.test(file.type || '') : /pdf/.test(file.type || '');
  if (!okType) return { ok: false, msg: type === 'photo' ? 'Choose an image.' : 'Choose a PDF.' };
  await ensureBucket(c.sb);
  const bytes = Buffer.from(await file.arrayBuffer());
  // Optimize gallery PHOTOS (not PDFs) through the same WebP/<100KB pipeline.
  const opt = type === 'photo' ? await processImage(bytes, 'gallery') : { buf: bytes, ext: null, contentType: null };
  const ext = opt.ext || (type === 'pdf' ? 'pdf' : ((file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')));
  const key = `items/${id}/media/${randomUUID()}.${ext}`;
  const up = await c.sb.storage.from(BUCKET).upload(key, opt.buf, { contentType: opt.contentType || file.type, upsert: true });
  if (up.error) return { ok: false, msg: up.error.message };
  const url = c.sb.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
  let nextSort = 0;
  try { const { data } = await c.sb.from('pricebook_media').select('sort_order').eq('item_id', id).order('sort_order', { ascending: false }).limit(1); nextSort = ((data && data[0]?.sort_order) || 0) + 1; } catch (_) {}
  const { data, error } = await c.sb.from('pricebook_media').insert({ item_id: id, media_type: type, title: clean(formData.get('title'), 160) || null, url, customer_visible: formData.get('customerVisible') !== 'false', sort_order: nextSort }).select('id, media_type, title, url, customer_visible, sort_order').maybeSingle();
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/catalog'); revalidatePath('/pricebook-admin');
  return { ok: true, msg: 'Uploaded.', row: data };
}

// Toggle a media row's customer-visible flag.
export async function setMediaVisible(mediaId, visible) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const { error } = await c.sb.from('pricebook_media').update({ customer_visible: !!visible }).eq('id', clean(mediaId, 80));
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/catalog'); revalidatePath('/pricebook-admin');
  return { ok: true, msg: visible ? 'Shown to customers.' : 'Hidden from customers.' };
}

// Reorder: persist an explicit ordered list of media ids.
export async function reorderItemMedia(itemId, orderedIds) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const ids = (Array.isArray(orderedIds) ? orderedIds : []).map((x) => clean(x, 80)).filter(Boolean);
  for (let i = 0; i < ids.length; i++) { try { await c.sb.from('pricebook_media').update({ sort_order: i }).eq('id', ids[i]).eq('item_id', clean(itemId, 80)); } catch (_) {} }
  revalidatePath('/catalog'); revalidatePath('/pricebook-admin');
  return { ok: true, msg: 'Order saved.' };
}

// Remove a media row.
export async function removeItemMedia(mediaId) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const { error } = await c.sb.from('pricebook_media').delete().eq('id', clean(mediaId, 80));
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/catalog'); revalidatePath('/pricebook-admin');
  return { ok: true, msg: 'Removed.' };
}

// Set the primary photo from a plain url (e.g. promote a gallery photo). Re-hosts if it's an external url.
export async function setItemPrimaryFromUrl(itemId, url) { return setItemPhotoUrl(itemId, url); }

// Promote an already-hosted media url to primary WITHOUT re-fetching (it's already in our bucket).
export async function promoteMediaToPrimary(itemId, url) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const u = clean(url, 1000); if (!/^https?:\/\//.test(u)) return { ok: false, msg: 'Bad image URL.' };
  const { error } = await c.sb.from('pricebook_items').update({ primary_photo_url: u }).eq('id', clean(itemId, 80));
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/catalog'); revalidatePath('/pricebook-admin');
  return { ok: true, msg: 'Set as primary photo.', url: u };
}
