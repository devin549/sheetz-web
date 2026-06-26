'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';

// Tech headshots — the avatar AND the face that rides in the customer "on my way" text.
// Public bucket so the avatar + the customer tracking page can show it. Writes go through the service role.
const BUCKET = 'tech-photos';

function decode(dataUrl) {
  const m = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) return null;
  return { mime: m[1], ext: m[1].split('/')[1].replace('jpeg', 'jpg'), buf: Buffer.from(m[2], 'base64') };
}

async function uploadPhoto(sb, key, dataUrl) {
  const img = decode(dataUrl);
  if (!img) return { ok: false, msg: 'Send a JPG, PNG, or WebP image.' };
  if (img.buf.length > 4_000_000) return { ok: false, msg: 'Image is too large — try again (the camera shrinks it for you).' };
  const path = `${key}.${img.ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, img.buf, { contentType: img.mime, upsert: true });
  if (error) return { ok: false, msg: /bucket/i.test(error.message) ? 'Run supabase/114_tech_photos.sql first.' : error.message };
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return { ok: true, url: `${data.publicUrl}?v=${Date.now()}` };
}

// Tech sets their OWN photo (selfie from Settings).
export async function setMyPhoto(dataUrl) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const sb = getSupabaseAdmin();
  const r = await uploadPhoto(sb, `u_${user.id}`, dataUrl);
  if (!r.ok) return r;
  const { error } = await sb.from('profiles').update({ photo_url: r.url }).eq('user_id', user.id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/account');
  return { ok: true, url: r.url };
}

// Office/owner sets (or replaces) a tech's photo.
export async function setTechPhoto(targetUserId, dataUrl) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!can(profile.role, 'manageUsers')) return { ok: false, msg: 'Office / owner only.' };
  if (!targetUserId) return { ok: false, msg: 'No tech selected.' };
  const sb = getSupabaseAdmin();
  const r = await uploadPhoto(sb, `u_${targetUserId}`, dataUrl);
  if (!r.ok) return r;
  const { error } = await sb.from('profiles').update({ photo_url: r.url }).eq('user_id', targetUserId);
  if (error) return { ok: false, msg: error.message };
  return { ok: true, url: r.url };
}
