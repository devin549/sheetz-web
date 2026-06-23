'use server';

import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { roleOf } from '@/lib/nav';
import { canArchivePhoto, canUploadPhotos, canViewJob, loadJob } from './jobAccess';

const BUCKET = 'job-photos';
const MAX_BYTES = 10 * 1024 * 1024;
const MIME_EXT = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/heic', 'heic'],
  ['image/heif', 'heif'],
]);
const PHOTO_KINDS = new Set(['job_photo', 'before', 'during', 'after', 'receipt', 'damage', 'equipment', 'closeout']);

function cleanText(value, max = 240) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function safeFileBase(value) {
  const base = cleanText(value || 'photo', 90)
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return base || 'photo';
}

function tagsFrom(value) {
  return String(value || '')
    .split(',')
    .map((tag) => cleanText(tag, 32).toLowerCase())
    .filter(Boolean)
    .slice(0, 8);
}

function extFrom(file) {
  const fromMime = MIME_EXT.get(file.type);
  if (fromMime) return fromMime;
  const match = String(file.name || '').toLowerCase().match(/\.([a-z0-9]{2,5})$/);
  return match ? match[1] : 'jpg';
}

async function getActionContext(jobId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const role = roleOf(user);
  const sb = getSupabaseAdmin();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  if (!sb) return { ok: false, msg: 'Server not configured.' };

  const { data: job, error } = await loadJob(sb, jobId);
  if (error) return { ok: false, msg: error.message };
  if (!job) return { ok: false, msg: 'Job not found.' };
  if (!(await canViewJob(sb, user, role, job))) return { ok: false, msg: 'Not allowed for this job.' };

  return { ok: true, user, role, sb, job };
}

export async function uploadJobPhoto(formData) {
  const jobId = cleanText(formData.get('jobId'), 80);
  const file = formData.get('photo');
  const kind = PHOTO_KINDS.has(String(formData.get('kind'))) ? String(formData.get('kind')) : 'job_photo';
  const caption = cleanText(formData.get('caption'), 700);
  const tags = tagsFrom(formData.get('tags'));
  const customerVisible = formData.get('customerVisible') === 'on';

  const ctx = await getActionContext(jobId);
  if (!ctx.ok) return ctx;
  if (!canUploadPhotos(ctx.role)) return { ok: false, msg: 'Your role cannot upload job photos.' };
  if (!file || typeof file.arrayBuffer !== 'function') return { ok: false, msg: 'Choose a photo first.' };
  if (!MIME_EXT.has(file.type)) return { ok: false, msg: 'Use JPG, PNG, WebP, HEIC, or HEIF.' };
  if (file.size > MAX_BYTES) return { ok: false, msg: 'Photo is over 10 MB.' };

  const id = randomUUID();
  const ext = extFrom(file);
  const originalName = cleanText(file.name || `photo.${ext}`, 160);
  const storagePath = `jobs/${jobId}/${new Date().toISOString().slice(0, 10)}/${id}-${safeFileBase(originalName)}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await ctx.sb.storage
    .from(BUCKET)
    .upload(storagePath, bytes, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) return { ok: false, msg: uploadError.message };

  const { error: insertError } = await ctx.sb.from('job_photos').insert({
    id,
    job_id: jobId,
    storage_bucket: BUCKET,
    storage_path: storagePath,
    file_name: originalName,
    mime_type: file.type,
    size_bytes: file.size,
    kind,
    caption: caption || null,
    tags,
    customer_visible: customerVisible,
    uploaded_by: ctx.user.id,
    uploaded_by_email: ctx.user.email,
    uploaded_by_name: ctx.user.user_metadata?.name || ctx.user.email,
  });

  if (insertError) {
    await ctx.sb.storage.from(BUCKET).remove([storagePath]);
    return { ok: false, msg: insertError.message };
  }

  revalidatePath(`/job/${jobId}`);
  revalidatePath('/board');
  revalidatePath('/my-day');
  return { ok: true, msg: 'Photo added.' };
}

export async function archiveJobPhoto(photoId, jobId) {
  const cleanPhotoId = cleanText(photoId, 80);
  const cleanJobId = cleanText(jobId, 80);
  const ctx = await getActionContext(cleanJobId);
  if (!ctx.ok) return ctx;

  const { data: photo, error } = await ctx.sb
    .from('job_photos')
    .select('id, job_id, uploaded_by, deleted_at')
    .eq('id', cleanPhotoId)
    .eq('job_id', cleanJobId)
    .maybeSingle();
  if (error) return { ok: false, msg: error.message };
  if (!photo || photo.deleted_at) return { ok: false, msg: 'Photo not found.' };
  if (!canArchivePhoto(ctx.role, ctx.user.id, photo)) return { ok: false, msg: 'Not allowed to archive this photo.' };

  const { error: updateError } = await ctx.sb
    .from('job_photos')
    .update({ deleted_at: new Date().toISOString(), deleted_by: ctx.user.id })
    .eq('id', cleanPhotoId);
  if (updateError) return { ok: false, msg: updateError.message };

  revalidatePath(`/job/${cleanJobId}`);
  revalidatePath('/board');
  revalidatePath('/my-day');
  return { ok: true, msg: 'Photo archived.' };
}
