import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import { can } from '@/lib/roles';
import { computeCloseout, ruleForJob } from '@/lib/qa';
import { canArchivePhoto, canUploadPhotos, canViewJob, jobTitle, loadJob, worksThisCustomer } from '../jobAccess';
import JobPhotos from '../JobPhotos';
import ProofTiles from '../ProofTiles';
import PhotoQACheck from './PhotoQACheck';
import { CircleCheck, CircleAlert, ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

async function loadPhotos(sb, jobId) {
  const COLS = 'id, job_id, storage_bucket, storage_path, file_name, mime_type, size_bytes, kind, caption, tags, customer_visible, uploaded_by, uploaded_by_email, uploaded_by_name, created_at';
  let { data, error } = await sb.from('job_photos').select(COLS + ', ai_flagged, ai_flag_reason').eq('job_id', jobId).is('deleted_at', null).order('created_at', { ascending: false });
  if (error && /column|schema cache|does not exist/i.test(error.message || '')) {
    ({ data, error } = await sb.from('job_photos').select(COLS).eq('job_id', jobId).is('deleted_at', null).order('created_at', { ascending: false })); // pre-131 fallback
  }
  if (error) return { photos: [], error };
  const photos = await Promise.all((data || []).map(async (p) => {
    const { data: s } = await sb.storage.from(p.storage_bucket || 'job-photos').createSignedUrl(p.storage_path, 3600);
    return { ...p, signedUrl: s?.signedUrl || null };
  }));
  return { photos, error: null };
}

export default async function JobPhotosScreen({ params }) {
  const { user, role, profile } = await requirePerm('seeAllJobs', 'seeQueue', 'seeOwnOnly', 'seeCrew');
  const id = params.id;
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">Photos</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;
  const sb = getSupabaseAdmin();
  const { data: job, error } = await loadJob(sb, id);
  if (error || !job) notFound();
  // Owns = this is the viewer's job (full controls). Otherwise allow a READ-ONLY view if they work this
  // customer (a tech pulling up a prior visit's proof for the customer they're serving). Else 404.
  const owns = await canViewJob(sb, user, profile, role, job);
  const readOnly = !owns;
  if (!owns && !(await worksThisCustomer(sb, role, profile, job.customer_id))) notFound();

  const { photos, error: photoError } = await loadPhotos(sb, id);
  let reviews = [];
  if (photos.length) {
    const rv = await sb.from('job_photo_reviews').select('id, photo_id, result, fail_reason, manager_note, reviewed_by_name, created_at').in('photo_id', photos.map((p) => p.id)).order('created_at', { ascending: false });
    reviews = rv.error ? [] : (rv.data || []);
  }
  const reviewByPhoto = {};
  reviews.forEach((r) => { if (!reviewByPhoto[r.photo_id]) reviewByPhoto[r.photo_id] = r; });
  const failIds = Object.values(reviewByPhoto).filter((r) => r.result === 'fail').map((r) => r.id);
  if (failIds.length) {
    const an = await sb.from('job_photo_annotations').select('id, review_id, photo_id, x, y, w').in('review_id', failIds);
    if (!an.error) { const byPhoto = {}; (an.data || []).forEach((a) => { (byPhoto[a.photo_id] = byPhoto[a.photo_id] || []).push(a); }); Object.values(reviewByPhoto).forEach((r) => { r.annotations = byPhoto[r.photo_id] || []; }); }
  }

  const closeout = computeCloseout({ photos, reviews, rule: ruleForJob(job) });
  const customer = job.customers || {};
  const canUpload = canUploadPhotos(role) && !readOnly;
  // Crew sessions to attribute proof to (fail-soft pre-87).
  let segments = [];
  try { const { data } = await sb.from('job_segments').select('id, segment_no, kind, assigned_tech_name, status').eq('parent_job_id', id).neq('status', 'cancelled').order('created_at', { ascending: true }); segments = data || []; } catch (_) {}
  const isDone = /done|complete|closed/.test(String(job.status || '').toLowerCase());
  const missing = new Set(closeout.missingKinds || []);

  return (
    <div className="wrap" style={{ maxWidth: 1040 }}>
      <Link href={readOnly ? `/invoices?customer=${job.customer_id}` : `/job/${id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--amber)', textDecoration: 'none' }}><ArrowLeft size={14} /> {readOnly ? `Back to ${customer.name || 'customer'} invoices` : 'Job Cockpit'}</Link>
      <div className="h1" style={{ marginTop: 6, marginBottom: 2 }}>📸 Photos · {customer.name || 'Customer'}</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>{jobTitle(job)}{job.job_number ? ` · #${job.job_number}` : ''} — {readOnly ? 'prior visit · read-only.' : 'tap a tile, the camera opens. Proof attaches to this job only.'}</div>
      {readOnly && <div className="card" style={{ borderLeft: '3px solid var(--amber)', marginBottom: 10, fontSize: 12.5 }}>👀 Read-only — you’re viewing a previous visit’s photos for {customer.name || 'this customer'}. You can’t add or change proof on another visit.</div>}

      {/* Required proof checklist */}
      {!photoError && (closeout.requiredKinds?.length > 0 || closeout.requireVideo || closeout.minPhotos > 0) && (
        <div className="card" style={{ borderLeft: `3px solid ${closeout.readyToClose ? 'var(--green)' : 'var(--amber)'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontWeight: 800 }}>Required proof</span>
            <span className="pill" style={{ marginLeft: 'auto', color: closeout.photoCount >= closeout.minPhotos ? 'var(--green)' : 'var(--amber)' }}>{closeout.photoCount}/{closeout.minPhotos} photos</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(closeout.requiredKinds || []).map((k) => {
              const ok = !missing.has(k);
              return <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: ok ? 600 : 800 }}>{ok ? <CircleCheck size={14} style={{ color: 'var(--green)' }} /> : <CircleAlert size={14} style={{ color: 'var(--amber)' }} />}<span style={{ textTransform: 'capitalize' }}>{k}</span></span>;
            })}
            {closeout.requireVideo && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: closeout.haveVideo ? 600 : 800 }}>{closeout.haveVideo ? <CircleCheck size={14} style={{ color: 'var(--green)' }} /> : <CircleAlert size={14} style={{ color: 'var(--amber)' }} />}🎬 Video</span>}
          </div>
        </div>
      )}

      {/* Camera-FIRST proof tiles — tap a tile, the iPad camera opens. */}
      {canUpload && !photoError && (
        <div className="card" style={{ marginTop: 10 }}>
          <ProofTiles jobId={id} photos={photos} segments={segments} requiredKinds={closeout.requiredKinds || []} requireVideo={closeout.requireVideo} jobType={job.job_type || ''} />
        </div>
      )}

      {canUpload && !photoError && <PhotoQACheck jobType={job.job_type || ''} requiredKinds={closeout.requiredKinds || []} />}

      {/* Photos + walkthrough videos in ONE gallery — videos render inline with a 🎬 badge (no separate section). */}
      <div style={{ marginTop: 10 }}>
        <JobPhotos jobId={id} photos={photos} reviewByPhoto={reviewByPhoto} closeout={closeout}
          canUpload={canUpload && !photoError} hideAddForm canArchive={!readOnly && (can(role, 'deleteJobs') || can(role, 'manageUsers') || can(role, 'assignJobs'))}
          canReview={!readOnly && can(role, 'qaReview') && !photoError} canOverride={!readOnly && can(role, 'qaOverride') && !photoError} isDone={isDone} currentUserId={user.id} />
      </div>
    </div>
  );
}
