'use server';

import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { canArchivePhoto, canUploadPhotos, canViewJob, loadJob } from './jobAccess';

const FAIL_CODES = new Set(['blurry', 'wrong_area', 'no_after_proof', 'unfinished', 'missing_equipment', 'customer_issue', 'other']);

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
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  const role = profile.role;
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };

  const { data: job, error } = await loadJob(sb, jobId);
  if (error) return { ok: false, msg: error.message };
  if (!job) return { ok: false, msg: 'Job not found.' };
  if (!(await canViewJob(sb, user, profile, role, job))) return { ok: false, msg: 'Not allowed for this job.' };

  return { ok: true, user, role, profile, sb, job };
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

// Supervisor QA: pass/fail a single photo with an optional reason + note. A failed photo blocks
// closeout until it's corrected (re-shot) or a supervisor overrides. Latest review per photo wins.
export async function reviewPhoto(photoId, jobId, result, failReason, note) {
  const ctx = await getActionContext(cleanText(jobId, 80));
  if (!ctx.ok) return ctx;
  if (!can(ctx.role, 'qaReview')) return { ok: false, msg: 'Your role can’t review QA.' };
  if (!['pass', 'fail'].includes(result)) return { ok: false, msg: 'Pass or fail?' };
  const reason = result === 'fail' ? (FAIL_CODES.has(failReason) ? failReason : null) : null;
  if (result === 'fail' && !reason) return { ok: false, msg: 'Pick a fail reason.' };

  const cleanPhoto = cleanText(photoId, 80);
  const { data: photo } = await ctx.sb.from('job_photos').select('id').eq('id', cleanPhoto).eq('job_id', ctx.job.id).maybeSingle();
  if (!photo) return { ok: false, msg: 'Photo not found on this job.' };

  const { error } = await ctx.sb.from('job_photo_reviews').insert({
    photo_id: cleanPhoto, job_id: String(ctx.job.id), result, fail_reason: reason,
    manager_note: cleanText(note, 500) || null, reviewed_by: ctx.user.id,
    reviewed_by_name: ctx.profile?.name || ctx.user.email,
  });
  if (error) return { ok: false, msg: error.message };
  try {
    await ctx.sb.from('audit_log').insert({
      actor_id: ctx.user.id, actor_name: ctx.profile?.name || ctx.user.email, role: ctx.role,
      action: 'qa.' + result, entity: 'photo', entity_id: cleanPhoto, detail: { job_id: String(ctx.job.id), reason },
    });
  } catch (_) {}
  revalidatePath(`/job/${ctx.job.id}`);
  revalidatePath('/supervisor/jobs');
  return { ok: true, msg: result === 'pass' ? 'Marked pass.' : 'Marked fail — closeout stays blocked until it’s fixed.' };
}

// Supervisor override: force a job to 'done' despite an incomplete closeout. Reason is required
// and logged to the audit trail (the no-shortcut rule).
export async function overrideCloseout(jobId, reason) {
  const ctx = await getActionContext(cleanText(jobId, 80));
  if (!ctx.ok) return ctx;
  if (!can(ctx.role, 'qaOverride')) return { ok: false, msg: 'Only a supervisor can override closeout.' };
  const note = cleanText(reason, 500);
  if (note.length < 4) return { ok: false, msg: 'Add a reason for the override.' };

  const { error } = await ctx.sb.from('jobs').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', ctx.job.id);
  if (error) return { ok: false, msg: error.message };
  try {
    await ctx.sb.from('audit_log').insert({
      actor_id: ctx.user.id, actor_name: ctx.profile?.name || ctx.user.email, role: ctx.role,
      action: 'closeout.override', entity: 'job', entity_id: String(ctx.job.id), detail: { reason: note },
    });
  } catch (_) {}
  revalidatePath(`/job/${ctx.job.id}`);
  revalidatePath('/board');
  revalidatePath('/supervisor/jobs');
  return { ok: true, msg: 'Closeout overridden — job marked complete.' };
}

// Mark a rental issued to this job as RETURNED — clears it from the closeout gate. Allowed for anyone
// who can work the job (tech on the job, dispatch/office) or shop. Writes returned_at/by for the audit.
export async function markRentalReturned(issueId, jobId) {
  const ctx = await getActionContext(cleanText(jobId, 80));
  if (!ctx.ok) return ctx;
  if (!(can(ctx.role, 'changeStatus') || can(ctx.role, 'manageInventory') || canUploadPhotos(ctx.role))) return { ok: false, msg: 'Your role can’t return rentals.' };
  const id = cleanText(issueId, 80);
  const { data: row, error: readErr } = await ctx.sb.from('shop_issues').select('id, job_id, kind, status').eq('id', id).maybeSingle();
  if (readErr) return { ok: false, msg: readErr.message };
  if (!row || String(row.job_id) !== String(ctx.job.id)) return { ok: false, msg: 'Rental not found on this job.' };
  if (row.kind !== 'rental') return { ok: false, msg: 'That item isn’t a rental.' };
  if (row.status === 'returned') return { ok: true, msg: 'Already returned.' };
  const { error } = await ctx.sb.from('shop_issues')
    .update({ status: 'returned', returned_at: new Date().toISOString(), returned_by: ctx.profile?.name || ctx.user.email })
    .eq('id', id);
  if (error) return { ok: false, msg: error.message };
  try {
    await ctx.sb.from('audit_log').insert({
      actor_id: ctx.user.id, actor_name: ctx.profile?.name || ctx.user.email, role: ctx.role,
      action: 'rental.returned', entity: 'shop_issue', entity_id: id, detail: { job_id: String(ctx.job.id) },
    });
  } catch (_) {}
  revalidatePath(`/job/${ctx.job.id}`);
  revalidatePath('/shop');
  return { ok: true, msg: 'Rental marked returned.' };
}

// Closeout v2 — save the disposition checklist (payment, signature, invoice, review, cash, warranty).
export async function saveCloseout(formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Not signed in.' };
  const profile = await loadProfile(user);
  if (profile.active === false || !(can(profile.role, 'changeStatus') || can(profile.role, 'qaReview') || canUploadPhotos(profile.role))) return { ok: false, msg: 'Your role can’t set closeout.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  const job_id = cleanText(formData.get('jobId'), 80);
  if (!job_id) return { ok: false, msg: 'No job.' };
  const bool = (k) => formData.get(k) === 'true' || formData.get(k) === 'on';
  const row = {
    job_id,
    payment_disposition: cleanText(formData.get('payment_disposition'), 40) || null,
    signed: bool('signed'), signed_by: cleanText(formData.get('signed_by'), 80) || null,
    invoice_status: cleanText(formData.get('invoice_status'), 30) || null,
    review_requested: bool('review_requested'),
    cash_status: cleanText(formData.get('cash_status'), 20) || null,
    warranty_packet: bool('warranty_packet'),
    note: cleanText(formData.get('note'), 300) || null,
    updated_by: profile.name || user.email, updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from('job_closeout').upsert(row, { onConflict: 'job_id' });
  if (error) return { ok: false, msg: /schema cache|does not exist|could not find/i.test(error.message || '') ? 'Run supabase/55_job_closeout.sql first.' : error.message };
  revalidatePath(`/job/${job_id}`); revalidatePath('/board');
  return { ok: true, msg: 'Closeout saved.' };
}
