'use server';

import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { canArchivePhoto, canUploadPhotos, canViewJob, loadJob } from './jobAccess';
import { closeoutReason } from '@/lib/qa';
import { postToDiscord } from '@/lib/discord';

const STATUS_STEPS = ['scheduled', 'enroute', 'on_site', 'done'];

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
  // Proof-flow extras (camera-first): where + how it was captured, and which crew session it belongs to.
  const segmentId = cleanText(formData.get('segmentId'), 60) || null;
  const source = formData.get('source') === 'camera' ? 'camera' : 'upload';
  const lat = Number(formData.get('lat')); const lng = Number(formData.get('lng'));

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

  const base = {
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
  };
  // Proof-flow columns (migrations 87 + 88). Insert with them; on a missing-column DB, retry with base.
  const extra = { segment_id: segmentId, source, qa_status: 'pending', lat: Number.isFinite(lat) ? lat : null, lng: Number.isFinite(lng) ? lng : null };
  let { error: insertError } = await ctx.sb.from('job_photos').insert({ ...base, ...extra });
  if (insertError && /column|schema cache|does not exist/i.test(insertError.message || '')) {
    ({ error: insertError } = await ctx.sb.from('job_photos').insert(base));
  }

  if (insertError) {
    await ctx.sb.storage.from(BUCKET).remove([storagePath]);
    return { ok: false, msg: insertError.message };
  }

  revalidatePath(`/job/${jobId}`);
  revalidatePath('/board');
  revalidatePath('/my-day');
  return { ok: true, msg: 'Photo added.' };
}

// Walkthrough VIDEO — big files, so the browser uploads DIRECT to Storage via a signed URL (avoids the
// serverless body limit). Step 1: mint the signed upload URL. Same job_photos spine, kind='walkthrough'.
const VIDEO_MIME = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/3gpp']);
const VIDEO_EXT = new Map([['video/mp4', 'mp4'], ['video/quicktime', 'mov'], ['video/webm', 'webm'], ['video/x-m4v', 'm4v'], ['video/3gpp', '3gp']]);
const VIDEO_MAX = 300 * 1024 * 1024; // 300 MB (the Storage bucket limit must allow this)

export async function createVideoUploadUrl(jobId, fileName, mime, size) {
  const ctx = await getActionContext(cleanText(jobId, 80));
  if (!ctx.ok) return ctx;
  if (!canUploadPhotos(ctx.role)) return { ok: false, msg: 'Your role can’t upload.' };
  if (!VIDEO_MIME.has(String(mime))) return { ok: false, msg: 'Use an MP4 / MOV / WebM video.' };
  if (Number(size) > VIDEO_MAX) return { ok: false, msg: 'Video is over 300 MB — keep it short.' };
  const ext = VIDEO_EXT.get(String(mime)) || 'mp4';
  const id = randomUUID();
  const path = `jobs/${ctx.job.id}/${new Date().toISOString().slice(0, 10)}/${id}-walkthrough.${ext}`;
  const { data, error } = await ctx.sb.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) return { ok: false, msg: error.message };
  return { ok: true, signedUrl: data.signedUrl, path, id };
}

// Step 2 (after the browser PUTs the file to the signed URL): record the job_photos row.
export async function recordVideoUpload(jobId, path, fileName, mime, size) {
  const ctx = await getActionContext(cleanText(jobId, 80));
  if (!ctx.ok) return ctx;
  if (!canUploadPhotos(ctx.role)) return { ok: false, msg: 'Your role can’t upload.' };
  const p = cleanText(path, 300);
  if (!p.startsWith(`jobs/${ctx.job.id}/`)) return { ok: false, msg: 'Bad upload path.' };
  const { error } = await ctx.sb.from('job_photos').insert({
    job_id: String(ctx.job.id), storage_bucket: BUCKET, storage_path: p,
    file_name: cleanText(fileName, 160) || 'walkthrough.mp4', mime_type: String(mime), size_bytes: Number(size) || null,
    kind: 'walkthrough', uploaded_by: ctx.user.id, uploaded_by_email: ctx.user.email, uploaded_by_name: ctx.profile?.name || ctx.user.email,
  });
  if (error) { try { await ctx.sb.storage.from(BUCKET).remove([p]); } catch (_) {} return { ok: false, msg: error.message }; }
  revalidatePath(`/job/${ctx.job.id}`); revalidatePath('/my-day');
  return { ok: true, msg: '🎬 Walkthrough video uploaded.' };
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
export async function reviewPhoto(photoId, jobId, result, failReason, note, annotation) {
  const ctx = await getActionContext(cleanText(jobId, 80));
  if (!ctx.ok) return ctx;
  if (!can(ctx.role, 'qaReview')) return { ok: false, msg: 'Your role can’t review QA.' };
  if (!['pass', 'fail'].includes(result)) return { ok: false, msg: 'Pass or fail?' };
  const reason = result === 'fail' ? (FAIL_CODES.has(failReason) ? failReason : null) : null;
  if (result === 'fail' && !reason) return { ok: false, msg: 'Pick a fail reason.' };

  const cleanPhoto = cleanText(photoId, 80);
  const { data: photo } = await ctx.sb.from('job_photos').select('id').eq('id', cleanPhoto).eq('job_id', ctx.job.id).maybeSingle();
  if (!photo) return { ok: false, msg: 'Photo not found on this job.' };

  const { data: reviewRow, error } = await ctx.sb.from('job_photo_reviews').insert({
    photo_id: cleanPhoto, job_id: String(ctx.job.id), result, fail_reason: reason,
    manager_note: cleanText(note, 500) || null, reviewed_by: ctx.user.id,
    reviewed_by_name: ctx.profile?.name || ctx.user.email,
  }).select('id').single();
  if (error) return { ok: false, msg: error.message };
  // Circle the problem on a FAIL so the tech sees WHERE — normalized 0..1 coords (job_photo_annotations).
  if (result === 'fail' && reviewRow && annotation && Number.isFinite(annotation.x) && Number.isFinite(annotation.y)) {
    const clamp = (n) => Math.max(0, Math.min(1, Number(n)));
    try {
      await ctx.sb.from('job_photo_annotations').insert({
        review_id: reviewRow.id, photo_id: cleanPhoto, shape: 'circle',
        x: clamp(annotation.x), y: clamp(annotation.y), w: clamp(annotation.r || 0.12),
        note: cleanText(note, 300) || null,
      });
    } catch (_) { /* annotations table optional — fail soft */ }
  }
  // A FAIL auto-opens a QA-Hold correction so the closeout block + corrections queue never depend on a
  // manager also clicking the button; a PASS auto-resolves any open hold on that same photo. Dedup + soft.
  if (reviewRow) {
    try {
      if (result === 'fail') {
        const { data: open } = await ctx.sb.from('job_corrections').select('id').eq('orig_job_id', String(ctx.job.id)).eq('photo_id', cleanPhoto).eq('status', 'open').maybeSingle();
        if (!open) await ctx.sb.from('job_corrections').insert({ orig_job_id: String(ctx.job.id), photo_id: cleanPhoto, review_id: reviewRow.id, fail_reason: reason, manager_note: cleanText(note, 500) || null, created_by: ctx.user.id, created_by_name: ctx.profile?.name || ctx.user.email });
      } else {
        await ctx.sb.from('job_corrections').update({ status: 'resolved', resolved_by_name: ctx.profile?.name || ctx.user.email, resolved_at: new Date().toISOString() }).eq('orig_job_id', String(ctx.job.id)).eq('photo_id', cleanPhoto).eq('status', 'open');
      }
    } catch (_) { /* job_corrections optional → manual create/resolve still works */ }
  }
  try {
    await ctx.sb.from('audit_log').insert({
      actor_id: ctx.user.id, actor_name: ctx.profile?.name || ctx.user.email, role: ctx.role,
      action: 'qa.' + result, entity: 'photo', entity_id: cleanPhoto, detail: { job_id: String(ctx.job.id), reason },
    });
  } catch (_) {}
  revalidatePath('/corrections');
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

// Advance the job's status from the Cockpit (Rolling → On site → Done). Same scope + close-gate rules
// as the My Day card: a field-only tech can only touch their own job, and 'done' is gated unless the
// caller can override. Stamps the matching timestamp so the workflow rail lights up the right step.
export async function setJobStatus(jobId, status) {
  const ctx = await getActionContext(cleanText(jobId, 80));
  if (!ctx.ok) return ctx;
  if (!can(ctx.role, 'changeStatus')) return { ok: false, msg: 'Your role can’t update job status.' };
  if (!STATUS_STEPS.includes(status)) return { ok: false, msg: 'Bad status.' };
  // Field-only tech is already scoped by canViewJob inside getActionContext, but double-check own-job.
  if (!can(ctx.role, 'seeAllJobs') && can(ctx.role, 'seeOwnOnly')) {
    if (!ctx.profile?.tech_id || String(ctx.job.tech_id) !== String(ctx.profile.tech_id)) return { ok: false, msg: 'That job isn’t assigned to you.' };
  }
  if (status === 'done' && !can(ctx.role, 'qaOverride')) {
    const reason = await closeoutReason(ctx.sb, ctx.job);
    if (reason) return { ok: false, msg: reason, blocked: 'closeout' };
  }
  const patch = { status };
  const now = new Date().toISOString();
  if (status === 'enroute') patch.enroute_at = now;
  if (status === 'on_site') patch.started_at = now;
  if (status === 'done') patch.completed_at = now;
  const { error } = await ctx.sb.from('jobs').update(patch).eq('id', ctx.job.id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath(`/job/${ctx.job.id}`); revalidatePath('/my-day'); revalidatePath('/board');
  return { ok: true, msg: status === 'done' ? '🎉 Job complete!' : 'Updated.' };
}

// ── HTML job-screen parity cards (En route → Notify · Need a hand / step away · Roll over) ──────────
// All internal pings: the customer is NEVER auto-texted from here (no-auto-send rule). The office relays
// the ETA to the customer. Logged to audit_log; best-effort Discord ping to #sheetz.
const custName = (job) => (job.customers && job.customers.name) || 'the customer';
async function pingOffice(ctx, action, message, detail = {}) {
  try { await ctx.sb.from('audit_log').insert({ actor_id: ctx.user.id, actor_name: ctx.profile?.name || ctx.user.email, role: ctx.role, action, entity: 'job', entity_id: String(ctx.job.id), detail }); } catch (_) {}
  try { await postToDiscord(message); } catch (_) {}
}

// "You're marked EN ROUTE" → Notify. Marks en route (stamps enroute_at) + pings the office to text the
// customer the ETA. One tap, no back-and-forth — but the customer text is office-relayed, never auto-sent.
export async function notifyEnRoute(jobId) {
  const ctx = await getActionContext(cleanText(jobId, 80));
  if (!ctx.ok) return ctx;
  if (!can(ctx.role, 'changeStatus')) return { ok: false, msg: 'Your role can’t update status.' };
  const s = String(ctx.job.status || '').toLowerCase();
  if (!/enroute|rolling/.test(s)) {
    const { error } = await ctx.sb.from('jobs').update({ status: 'enroute', enroute_at: new Date().toISOString() }).eq('id', ctx.job.id);
    if (error) return { ok: false, msg: error.message };
  }
  await pingOffice(ctx, 'job.enroute_notify', `🚚 **${ctx.profile?.name || 'Tech'} is EN ROUTE** to ${custName(ctx.job)}${ctx.job.job_number ? ` · job ${ctx.job.job_number}` : ''} — text them the ETA.`, { job_number: ctx.job.job_number });
  revalidatePath(`/job/${ctx.job.id}`); revalidatePath('/my-day'); revalidatePath('/board');
  return { ok: true, msg: `Marked en route — office will text ${custName(ctx.job)} your ETA.` };
}

// "Need a hand?" + step-away (Parts run / Lunch / Personal). The job STAYS OPEN; the office is told why
// the tech stepped off so nobody thinks it stalled. Internal only.
const STEP_REASONS = { parts_run: 'Parts run', lunch: 'Lunch', personal: 'Personal', help: 'Needs a hand' };
export async function stepAway(jobId, reason, note) {
  const ctx = await getActionContext(cleanText(jobId, 80));
  if (!ctx.ok) return ctx;
  if (!(can(ctx.role, 'changeStatus') || can(ctx.role, 'seeOwnOnly'))) return { ok: false, msg: 'Not allowed.' };
  const key = STEP_REASONS[reason] ? reason : null;
  if (!key) return { ok: false, msg: 'Pick a reason.' };
  const label = STEP_REASONS[key];
  const n = cleanText(note, 200);
  await pingOffice(ctx, 'job.step_away', `🚶 **${ctx.profile?.name || 'Tech'} — ${label}** on ${custName(ctx.job)}${ctx.job.job_number ? ` · job ${ctx.job.job_number}` : ''}${n ? `: ${n}` : ''}. Job stays open.`, { reason: key, note: n });
  revalidatePath(`/job/${ctx.job.id}`);
  return { ok: true, msg: key === 'help' ? 'Office pinged — help is on the way.' : `Office knows you're on ${label.toLowerCase()} — job stays open.` };
}

// "Can't finish today?" → roll the job to another day. SAME job number, parts, and history — we just move
// the schedule and reset it to scheduled. Default +1 day at the same time.
export async function rollOverJob(jobId, note) {
  const ctx = await getActionContext(cleanText(jobId, 80));
  if (!ctx.ok) return ctx;
  if (!can(ctx.role, 'changeStatus')) return { ok: false, msg: 'Your role can’t reschedule.' };
  const base = ctx.job.scheduled_at ? new Date(ctx.job.scheduled_at) : new Date();
  if (isNaN(base.getTime())) base.setTime(Date.now());
  const next = new Date(base.getTime() + 24 * 3600 * 1000);
  const n = cleanText(note, 200);
  const { error } = await ctx.sb.from('jobs').update({ scheduled_at: next.toISOString(), status: 'scheduled', enroute_at: null, started_at: null }).eq('id', ctx.job.id);
  if (error) return { ok: false, msg: error.message };
  await pingOffice(ctx, 'job.rollover', `📆 **Rolled over** — ${custName(ctx.job)}${ctx.job.job_number ? ` · job ${ctx.job.job_number}` : ''} moved to ${next.toLocaleDateString()} (same job, parts & history kept)${n ? `: ${n}` : ''}.`, { to: next.toISOString(), note: n });
  revalidatePath(`/job/${ctx.job.id}`); revalidatePath('/my-day'); revalidatePath('/board');
  return { ok: true, msg: `Rolled to ${next.toLocaleDateString()} — same job, parts & history kept.` };
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

// Save the tech's closeout-question answers for a job (merged into the job_closeout_answers row).
// Allowed for anyone who can work the job. Values are clamped; the gate (lib/qa) decides pass/block.
export async function saveCloseoutAnswers(jobId, answers) {
  const ctx = await getActionContext(cleanText(jobId, 80));
  if (!ctx.ok) return ctx;
  if (!(can(ctx.role, 'changeStatus') || can(ctx.role, 'qaReview') || canUploadPhotos(ctx.role))) return { ok: false, msg: 'Your role can’t answer closeout questions.' };
  const clean = {};
  if (answers && typeof answers === 'object') {
    for (const [k, v] of Object.entries(answers)) {
      const key = cleanText(k, 60);
      if (key) clean[key] = cleanText(v, 300);
    }
  }
  const { data: existing } = await ctx.sb.from('job_closeout_answers').select('answers').eq('job_id', String(ctx.job.id)).maybeSingle();
  const merged = { ...((existing && existing.answers) || {}), ...clean };
  const { error } = await ctx.sb.from('job_closeout_answers').upsert(
    { job_id: String(ctx.job.id), answers: merged, updated_by: ctx.profile?.name || ctx.user.email, updated_at: new Date().toISOString() },
    { onConflict: 'job_id' });
  if (error) return { ok: false, msg: /schema cache|does not exist|could not find/i.test(error.message || '') ? 'Run supabase/67_closeout_questions.sql first.' : error.message };
  revalidatePath(`/job/${ctx.job.id}`);
  return { ok: true, msg: 'Answers saved.' };
}

// ── CB Cam corrections (QA Hold) — the "tech already left" flow ────────────────────────────────
// Open a correction work order for a failed photo: links orig job + photo + latest fail review (reason,
// note, circle). Office-only (qaReview). The job can't fully close while a correction is open.
export async function createCorrection(jobId, photoId) {
  const ctx = await getActionContext(cleanText(jobId, 80));
  if (!ctx.ok) return ctx;
  if (!can(ctx.role, 'qaReview')) return { ok: false, msg: 'Only a supervisor/office can open a correction.' };
  const pid = cleanText(photoId, 80);
  const { data: rev } = await ctx.sb.from('job_photo_reviews')
    .select('id, fail_reason, manager_note').eq('photo_id', pid).eq('job_id', String(ctx.job.id))
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!rev || rev.result === 'pass') { /* still allow — office may correct a non-failed photo */ }
  const { data: existing } = await ctx.sb.from('job_corrections').select('id').eq('orig_job_id', String(ctx.job.id)).eq('photo_id', pid).eq('status', 'open').maybeSingle();
  if (existing) return { ok: false, msg: 'A correction is already open for this photo.' };
  const { data: row, error } = await ctx.sb.from('job_corrections').insert({
    orig_job_id: String(ctx.job.id), photo_id: pid, review_id: rev?.id || null,
    fail_reason: rev?.fail_reason || null, manager_note: rev?.manager_note || null,
    created_by: ctx.user.id, created_by_name: ctx.profile?.name || ctx.user.email,
  }).select('id').single();
  if (error) return { ok: false, msg: /schema cache|does not exist|could not find/i.test(error.message || '') ? 'Run supabase/68_job_corrections.sql first.' : error.message };
  try { await ctx.sb.from('audit_log').insert({ actor_id: ctx.user.id, actor_name: ctx.profile?.name || ctx.user.email, role: ctx.role, action: 'correction.open', entity: 'job', entity_id: String(ctx.job.id), detail: { photo_id: pid, correction_id: row.id } }); } catch (_) {}
  revalidatePath(`/job/${ctx.job.id}`); revalidatePath('/corrections'); revalidatePath('/supervisor/jobs');
  return { ok: true, msg: 'QA Hold opened — correction needed.' };
}

// Load a correction + authorize the caller via its original job. Returns {ctx, corr} or {ok:false}.
async function correctionCtx(correctionId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  const { data: corr } = await sb.from('job_corrections').select('*').eq('id', cleanText(correctionId, 80)).maybeSingle();
  if (!corr) return { ok: false, msg: 'Correction not found.' };
  return { ok: true, sb, user, profile, role: profile.role, corr };
}

// Office logs that the customer was contacted about a correction (never auto-texts — human decision).
export async function markCustomerContacted(correctionId) {
  const c = await correctionCtx(correctionId);
  if (!c.ok) return c;
  if (!(can(c.role, 'contactCustomer') || can(c.role, 'qaReview') || can(c.role, 'manageUsers'))) return { ok: false, msg: 'Not allowed.' };
  const { error } = await c.sb.from('job_corrections').update({ customer_contacted: true, contacted_by: c.profile?.name || c.user.email, contacted_at: new Date().toISOString() }).eq('id', c.corr.id);
  if (error) return { ok: false, msg: error.message };
  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: c.profile?.name || c.user.email, role: c.role, action: 'correction.contacted', entity: 'job', entity_id: c.corr.orig_job_id, detail: { correction_id: c.corr.id } }); } catch (_) {}
  revalidatePath('/corrections'); revalidatePath(`/job/${c.corr.orig_job_id}`);
  return { ok: true, msg: 'Logged — customer contacted.' };
}

// Resolve a correction (corrected proof passed). Supervisor only.
export async function resolveCorrection(correctionId) {
  const c = await correctionCtx(correctionId);
  if (!c.ok) return c;
  if (!can(c.role, 'qaReview')) return { ok: false, msg: 'Only a supervisor/office can resolve.' };
  const { error } = await c.sb.from('job_corrections').update({ status: 'resolved', resolved_by_name: c.profile?.name || c.user.email, resolved_at: new Date().toISOString() }).eq('id', c.corr.id);
  if (error) return { ok: false, msg: error.message };
  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: c.profile?.name || c.user.email, role: c.role, action: 'correction.resolved', entity: 'job', entity_id: c.corr.orig_job_id, detail: { correction_id: c.corr.id } }); } catch (_) {}
  revalidatePath('/corrections'); revalidatePath(`/job/${c.corr.orig_job_id}`);
  return { ok: true, msg: 'Correction resolved.' };
}

// Book a correction VISIT — clones the original into a new scheduled high-priority 'Correction' job so
// it lands on the tech's schedule with the failure context. Best-effort; links correction_job_id.
export async function scheduleCorrectionVisit(correctionId) {
  const c = await correctionCtx(correctionId);
  if (!c.ok) return c;
  if (!(can(c.role, 'qaReview') || can(c.role, 'assignJobs') || can(c.role, 'createJobs'))) return { ok: false, msg: 'Not allowed.' };
  if (c.corr.correction_job_id) return { ok: false, msg: 'A correction visit is already booked.' };
  const { data: orig } = await c.sb.from('jobs').select('customer_id, tech_id, job_type, address').eq('id', c.corr.orig_job_id).maybeSingle();
  if (!orig) return { ok: false, msg: 'Original job not found.' };
  const note = `QA correction for job ${c.corr.orig_job_id} — ${c.corr.fail_reason || 'failed photo'}${c.corr.manager_note ? ': ' + c.corr.manager_note : ''}`;
  const base = { customer_id: orig.customer_id, tech_id: orig.tech_id, job_type: `Correction — ${orig.job_type || 'photo redo'}`, status: 'scheduled', priority: 'high', notes: note };
  let ins = await c.sb.from('jobs').insert(base).select('id').single();
  if (ins.error) { const { priority, notes, ...core } = base; ins = await c.sb.from('jobs').insert(core).select('id').single(); }
  if (ins.error) return { ok: false, msg: ins.error.message };
  await c.sb.from('job_corrections').update({ correction_job_id: String(ins.data.id) }).eq('id', c.corr.id);
  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: c.profile?.name || c.user.email, role: c.role, action: 'correction.scheduled', entity: 'job', entity_id: c.corr.orig_job_id, detail: { correction_id: c.corr.id, correction_job_id: String(ins.data.id) } }); } catch (_) {}
  revalidatePath('/corrections'); revalidatePath('/board');
  return { ok: true, msg: 'Correction visit booked on the schedule.' };
}

// Tech → office message from the cockpit (e.g. "photo failed, need help"). Internal only; logged.
export async function messageOffice(jobId, text) {
  const ctx = await getActionContext(cleanText(jobId, 80));
  if (!ctx.ok) return ctx;
  const body = cleanText(text, 500);
  if (body.length < 2) return { ok: false, msg: 'Type a short message.' };
  try {
    await ctx.sb.from('audit_log').insert({ actor_id: ctx.user.id, actor_name: ctx.profile?.name || ctx.user.email, role: ctx.role, action: 'tech.message', entity: 'job', entity_id: String(ctx.job.id), detail: { text: body } });
  } catch (e) { return { ok: false, msg: 'Could not send.' }; }
  revalidatePath(`/job/${ctx.job.id}`);
  return { ok: true, msg: 'Sent to the office.' };
}

// Set the per-job financial inputs the pay formula needs: material cost + dispatch fee (dollars in).
export async function setJobCosts(jobId, materialDollars, dispatchDollars) {
  const ctx = await getActionContext(cleanText(jobId, 80));
  if (!ctx.ok) return ctx;
  if (!(can(ctx.role, 'changeStatus') || can(ctx.role, 'collectPayment') || can(ctx.role, 'seeFinancials') || canUploadPhotos(ctx.role))) return { ok: false, msg: 'Your role can’t set job costs.' };
  const mc = Math.max(0, Math.round(Number(materialDollars) * 100)) || 0;
  const df = Math.max(0, Math.round(Number(dispatchDollars) * 100)) || 0;
  const { error } = await ctx.sb.from('jobs').update({ material_cost_cents: mc, dispatch_fee_cents: df }).eq('id', ctx.job.id);
  if (error) return { ok: false, msg: /material_cost|dispatch_fee|column|schema cache/i.test(error.message || '') ? 'Run supabase/73_pay_structure.sql first.' : error.message };
  try { await ctx.sb.from('audit_log').insert({ actor_id: ctx.user.id, actor_name: ctx.profile?.name || ctx.user.email, role: ctx.role, action: 'job.costs', entity: 'job', entity_id: String(ctx.job.id), detail: { material_cents: mc, dispatch_cents: df } }); } catch (_) {}
  revalidatePath(`/job/${ctx.job.id}`); revalidatePath('/pay');
  return { ok: true, msg: 'Job costs saved — feeds pay.' };
}

// Set a SUBCONTRACTOR cost on a job — passed AT COST (no markup). Setting/changing it resets verification,
// so it stays "pending" until Accounting confirms it again.
export async function setJobSub(jobId, subDollars, vendor) {
  const ctx = await getActionContext(cleanText(jobId, 80));
  if (!ctx.ok) return ctx;
  if (!(can(ctx.role, 'changeStatus') || can(ctx.role, 'collectPayment') || can(ctx.role, 'seeFinancials') || canUploadPhotos(ctx.role))) return { ok: false, msg: 'Your role can’t set job costs.' };
  const sc = Math.max(0, Math.round(Number(subDollars) * 100)) || 0;
  const vend = cleanText(vendor, 120);
  const { error } = await ctx.sb.from('jobs').update({ sub_cost_cents: sc, sub_vendor: vend || null, sub_verified: false, sub_verified_by: null, sub_verified_at: null }).eq('id', ctx.job.id);
  if (error) return { ok: false, msg: /sub_cost|sub_vendor|column|schema cache/i.test(error.message || '') ? 'Run supabase/115_job_subcontractor.sql first.' : error.message };
  try { await ctx.sb.from('audit_log').insert({ actor_id: ctx.user.id, actor_name: ctx.profile?.name || ctx.user.email, role: ctx.role, action: 'job.sub', entity: 'job', entity_id: String(ctx.job.id), detail: { sub_cents: sc, vendor: vend } }); } catch (_) {}
  revalidatePath(`/job/${ctx.job.id}`); revalidatePath('/pay'); revalidatePath('/payroll');
  return { ok: true, msg: sc > 0 ? 'Sub cost saved — pending Accounting verification.' : 'Sub cost cleared.' };
}

// Accounting (or owner) verifies a job's subcontractor cost → it finalizes in pay.
export async function verifyJobSub(jobId) {
  const ctx = await getActionContext(cleanText(jobId, 80));
  if (!ctx.ok) return ctx;
  if (!(can(ctx.role, 'seeFinancials') || can(ctx.role, 'manageUsers'))) return { ok: false, msg: 'Accounting / owner only.' };
  const { error } = await ctx.sb.from('jobs').update({ sub_verified: true, sub_verified_by: ctx.profile?.name || ctx.user.email, sub_verified_at: new Date().toISOString() }).eq('id', ctx.job.id);
  if (error) return { ok: false, msg: error.message };
  try { await ctx.sb.from('audit_log').insert({ actor_id: ctx.user.id, actor_name: ctx.profile?.name || ctx.user.email, role: ctx.role, action: 'job.sub.verify', entity: 'job', entity_id: String(ctx.job.id), detail: {} }); } catch (_) {}
  revalidatePath('/pay'); revalidatePath('/payroll'); revalidatePath(`/job/${ctx.job.id}`);
  return { ok: true, msg: 'Verified — it finalizes in pay.' };
}

// Reserve / request a tool for this job — logged so the holder + office see it (internal, no auto-text).
export async function requestTool(toolId, jobId, toolName, holder) {
  const ctx = await getActionContext(cleanText(jobId, 80));
  if (!ctx.ok) return ctx;
  if (!(can(ctx.role, 'changeStatus') || can(ctx.role, 'seeOwnOnly') || can(ctx.role, 'seeCrew'))) return { ok: false, msg: 'Not allowed.' };
  try {
    await ctx.sb.from('audit_log').insert({ actor_id: ctx.user.id, actor_name: ctx.profile?.name || ctx.user.email, role: ctx.role, action: 'tool.request', entity: 'job', entity_id: String(ctx.job.id), detail: { tool_id: cleanText(toolId, 80), tool: cleanText(toolName, 80), holder: cleanText(holder, 80) } });
  } catch (e) { return { ok: false, msg: 'Could not send.' }; }
  return { ok: true, msg: `Requested ${toolName || 'tool'}${holder ? ' from ' + holder : ''} — they’re notified.` };
}

// ── Estimate / quote jobs ───────────────────────────────────────────────────────────────────────
const ESTIMATE_OUTCOMES = new Set(['sold_now', 'not_sold', 'needs_follow_up', 'needs_parts', 'customer_not_ready']);

// Tech/office set the estimate outcome (required before an estimate can close).
export async function setEstimateOutcome(jobId, outcome) {
  const ctx = await getActionContext(cleanText(jobId, 80));
  if (!ctx.ok) return ctx;
  if (!can(ctx.role, 'changeStatus')) return { ok: false, msg: 'Your role can’t set the outcome.' };
  if (!ESTIMATE_OUTCOMES.has(outcome)) return { ok: false, msg: 'Pick an outcome.' };
  const { error } = await ctx.sb.from('jobs').update({ estimate_outcome: outcome }).eq('id', ctx.job.id);
  if (error) return { ok: false, msg: /estimate_outcome|column|schema cache/i.test(error.message || '') ? 'Run supabase/69_estimate_jobs.sql first.' : error.message };
  try { await ctx.sb.from('audit_log').insert({ actor_id: ctx.user.id, actor_name: ctx.profile?.name || ctx.user.email, role: ctx.role, action: 'estimate.outcome', entity: 'job', entity_id: String(ctx.job.id), detail: { outcome } }); } catch (_) {}
  revalidatePath(`/job/${ctx.job.id}`); revalidatePath('/my-day');
  return { ok: true, msg: 'Outcome saved.' };
}

// Sold → create a WORK job from the estimate (normal closeout rules apply to the new job). Links both ways.
export async function convertEstimateToWork(jobId) {
  const ctx = await getActionContext(cleanText(jobId, 80));
  if (!ctx.ok) return ctx;
  if (!(can(ctx.role, 'createJobs') || can(ctx.role, 'assignJobs') || can(ctx.role, 'qaReview'))) return { ok: false, msg: 'Not allowed to convert.' };
  if (ctx.job.converted_to_job_id) return { ok: false, msg: 'Already converted to a work job.' };
  const baseType = String(ctx.job.job_type || 'Service').replace(/\b(estimate|quote|bid)\b/ig, '').replace(/[-·\s]+$/, '').trim() || 'Service';
  const base = { customer_id: ctx.job.customer_id, tech_id: ctx.job.tech_id, job_type: baseType, job_class: 'residential', status: 'scheduled', priority: ctx.job.priority || null, converted_from_job_id: String(ctx.job.id) };
  let ins = await ctx.sb.from('jobs').insert(base).select('id').single();
  if (ins.error) { const { converted_from_job_id, job_class, priority, ...core } = base; ins = await ctx.sb.from('jobs').insert(core).select('id').single(); }
  if (ins.error) return { ok: false, msg: ins.error.message };
  await ctx.sb.from('jobs').update({ converted_to_job_id: String(ins.data.id) }).eq('id', ctx.job.id);
  try { await ctx.sb.from('audit_log').insert({ actor_id: ctx.user.id, actor_name: ctx.profile?.name || ctx.user.email, role: ctx.role, action: 'estimate.convert', entity: 'job', entity_id: String(ctx.job.id), detail: { work_job_id: String(ins.data.id) } }); } catch (_) {}
  revalidatePath(`/job/${ctx.job.id}`); revalidatePath('/board');
  return { ok: true, msg: 'Work job created.', jobId: String(ins.data.id) };
}

// Store the DispatchMe job id on this Sheetz job for REFERENCE (no photo sync). Office only.
export async function setDispatchmeId(jobId, value) {
  const ctx = await getActionContext(cleanText(jobId, 80));
  if (!ctx.ok) return ctx;
  if (!(can(ctx.role, 'assignJobs') || can(ctx.role, 'manageUsers') || can(ctx.role, 'createJobs'))) return { ok: false, msg: 'Not allowed.' };
  const v = cleanText(value, 60) || null;
  const { error } = await ctx.sb.from('jobs').update({ dispatchme_job_id: v }).eq('id', ctx.job.id);
  if (error) return { ok: false, msg: /dispatchme|column|schema cache/i.test(error.message || '') ? 'Run supabase/69_estimate_jobs.sql first.' : error.message };
  revalidatePath(`/job/${ctx.job.id}`);
  return { ok: true, msg: v ? 'DispatchMe id saved.' : 'DispatchMe id cleared.' };
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
