'use server';

import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { roleOf } from '@/lib/nav';
import { canArchivePhoto, canUploadPhotos, canViewJob, loadJob } from './jobAccess';

const BUCKET = 'job-photos';
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = 250 * 1024 * 1024;
const MIME_RULES = new Map([
  ['image/jpeg', { ext: 'jpg', mediaType: 'photo', mimeType: 'image/jpeg' }],
  ['image/png', { ext: 'png', mediaType: 'photo', mimeType: 'image/png' }],
  ['image/webp', { ext: 'webp', mediaType: 'photo', mimeType: 'image/webp' }],
  ['image/heic', { ext: 'heic', mediaType: 'photo', mimeType: 'image/heic' }],
  ['image/heif', { ext: 'heif', mediaType: 'photo', mimeType: 'image/heif' }],
  ['video/mp4', { ext: 'mp4', mediaType: 'video', mimeType: 'video/mp4' }],
  ['video/quicktime', { ext: 'mov', mediaType: 'video', mimeType: 'video/quicktime' }],
  ['video/webm', { ext: 'webm', mediaType: 'video', mimeType: 'video/webm' }],
]);
const EXT_RULES = new Map([
  ['jpg', MIME_RULES.get('image/jpeg')],
  ['jpeg', MIME_RULES.get('image/jpeg')],
  ['png', MIME_RULES.get('image/png')],
  ['webp', MIME_RULES.get('image/webp')],
  ['heic', MIME_RULES.get('image/heic')],
  ['heif', MIME_RULES.get('image/heif')],
  ['mp4', MIME_RULES.get('video/mp4')],
  ['mov', MIME_RULES.get('video/quicktime')],
  ['webm', MIME_RULES.get('video/webm')],
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

function fileExt(file) {
  const match = String(file.name || '').toLowerCase().match(/\.([a-z0-9]{2,5})$/);
  return match ? match[1] : '';
}

function ruleFromFile(file) {
  return MIME_RULES.get(file.type) || EXT_RULES.get(fileExt(file));
}

function extFrom(file, rule) {
  if (rule?.ext) return rule.ext;
  return fileExt(file) || 'jpg';
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

export async function uploadJobMedia(formData) {
  const jobId = cleanText(formData.get('jobId'), 80);
  const file = formData.get('media');
  const caption = cleanText(formData.get('caption'), 700);
  const tags = tagsFrom(formData.get('tags'));
  const customerVisible = formData.get('customerVisible') === 'on';

  const ctx = await getActionContext(jobId);
  if (!ctx.ok) return ctx;
  if (!canUploadPhotos(ctx.role)) return { ok: false, msg: 'Your role cannot upload job media.' };
  if (!file || typeof file.arrayBuffer !== 'function') return { ok: false, msg: 'Choose a file first.' };

  const rule = ruleFromFile(file);
  if (!rule) return { ok: false, msg: 'Use JPG, PNG, WebP, HEIC, MP4, MOV, or WebM.' };
  const mediaType = rule.mediaType;
  const contentType = file.type || rule.mimeType;
  const maxBytes = mediaType === 'video' ? VIDEO_MAX_BYTES : PHOTO_MAX_BYTES;
  if (file.size > maxBytes) {
    return { ok: false, msg: mediaType === 'video' ? 'Video is over 250 MB.' : 'Photo is over 10 MB.' };
  }

  const requestedKind = String(formData.get('kind'));
  const kind = mediaType === 'video'
    ? 'walkthrough'
    : (PHOTO_KINDS.has(requestedKind) ? requestedKind : 'job_photo');

  const id = randomUUID();
  const ext = extFrom(file, rule);
  const originalName = cleanText(file.name || `photo.${ext}`, 160);
  const storagePath = `jobs/${jobId}/${mediaType}/${new Date().toISOString().slice(0, 10)}/${id}-${safeFileBase(originalName)}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await ctx.sb.storage
    .from(BUCKET)
    .upload(storagePath, bytes, {
      contentType,
      upsert: false,
    });
  if (uploadError) return { ok: false, msg: uploadError.message };

  const { error: insertError } = await ctx.sb.from('job_photos').insert({
    id,
    job_id: jobId,
    storage_bucket: BUCKET,
    storage_path: storagePath,
    file_name: originalName,
    mime_type: contentType,
    media_type: mediaType,
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
  return { ok: true, msg: mediaType === 'video' ? 'Walkthrough video added.' : 'Photo added.' };
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
  if (!photo || photo.deleted_at) return { ok: false, msg: 'Media not found.' };
  if (!canArchivePhoto(ctx.role, ctx.user.id, photo)) return { ok: false, msg: 'Not allowed to archive this media.' };

  const { error: updateError } = await ctx.sb
    .from('job_photos')
    .update({ deleted_at: new Date().toISOString(), deleted_by: ctx.user.id })
    .eq('id', cleanPhotoId);
  if (updateError) return { ok: false, msg: updateError.message };

  revalidatePath(`/job/${cleanJobId}`);
  revalidatePath('/board');
  revalidatePath('/my-day');
  return { ok: true, msg: 'Media archived.' };
}
