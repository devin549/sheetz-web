import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import { can } from '@/lib/roles';
import { computeCloseout, getDispo } from '@/lib/qa';
import JobPhotos from './JobPhotos';
import CloseoutV2 from './CloseoutV2';
import { canArchivePhoto, canUploadPhotos, canViewJob, jobTitle, loadJob } from './jobAccess';
import { Lock, CircleCheck, CircleAlert } from 'lucide-react';

export const dynamic = 'force-dynamic';

async function loadReviews(sb, photoIds) {
  if (!photoIds.length) return [];
  const { data, error } = await sb
    .from('job_photo_reviews')
    .select('id, photo_id, result, fail_reason, manager_note, reviewed_by_name, created_at')
    .in('photo_id', photoIds)
    .order('created_at', { ascending: false });
  return error ? [] : (data || []); // table may not be migrated yet → no reviews
}

function money(n) {
  return '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function fmtDate(value) {
  if (!value) return 'not scheduled';
  try {
    return new Date(value).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return 'not scheduled';
  }
}

function statusLabel(value) {
  const s = String(value || 'scheduled').toLowerCase();
  if (/done|complete|closed/.test(s)) return 'Complete';
  if (/on_site|onsite/.test(s)) return 'On site';
  if (/enroute|en route|rolling/.test(s)) return 'En route';
  if (/cancel/.test(s)) return 'Cancelled';
  if (/hold/.test(s)) return 'Hold';
  return 'Scheduled';
}

async function loadPhotos(sb, jobId) {
  const { data, error } = await sb
    .from('job_photos')
    .select('id, job_id, storage_bucket, storage_path, file_name, mime_type, size_bytes, kind, caption, tags, customer_visible, uploaded_by, uploaded_by_email, uploaded_by_name, created_at')
    .eq('job_id', jobId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) return { photos: [], error };

  const photos = await Promise.all((data || []).map(async (photo) => {
    const { data: signed } = await sb.storage
      .from(photo.storage_bucket || 'job-photos')
      .createSignedUrl(photo.storage_path, 60 * 60);
    return { ...photo, signedUrl: signed?.signedUrl || null };
  }));
  return { photos, error: null };
}

export default async function JobDetail({ params }) {
  const { user, role, profile } = await requirePerm('seeAllJobs', 'seeQueue', 'seeOwnOnly', 'seeCrew');
  const id = params.id;

  if (!isAdminConfigured) {
    return (
      <div className="wrap">
        <div className="h1">Job</div>
        <div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel to read jobs and photos.</div>
      </div>
    );
  }

  const sb = getSupabaseAdmin();
  const { data: job, error } = await loadJob(sb, id);
  if (error || !job) notFound();
  if (!(await canViewJob(sb, user, profile, role, job))) notFound();

  const { photos, error: photoError } = await loadPhotos(sb, id);
  const reviews = await loadReviews(sb, photos.map((p) => p.id));
  const reviewByPhoto = {}; // latest review per photo (reviews are desc by created_at)
  reviews.forEach((r) => { if (!reviewByPhoto[r.photo_id]) reviewByPhoto[r.photo_id] = r; });
  const closeout = computeCloseout({ photos, reviews });
  const dispo = await getDispo(sb, id, job);
  const needWarranty = ['warranty', 'insurance'].includes(String(job.job_class || '').toLowerCase()) || !!job.warranty_provider;

  const customer = job.customers || {};
  const techName = job.tech_name || job.techs?.name || 'Unassigned';
  const title = jobTitle(job);
  const canUpload = canUploadPhotos(role);
  const canArchiveAny = can(role, 'deleteJobs') || can(role, 'manageUsers') || can(role, 'assignJobs');
  const canReview = can(role, 'qaReview');
  const canOverride = can(role, 'qaOverride');
  const isDone = /done|complete|closed/.test(String(job.status || '').toLowerCase());

  return (
    <div className="wrap" style={{ maxWidth: 1040 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Link href="/my-day" className="muted" style={{ fontSize: 12 }}>My Day</Link>
        <span className="muted">/</span>
        <Link href="/board" className="muted" style={{ fontSize: 12 }}>Board</Link>
      </div>

      <div className="card card-amber" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 240, flex: '1 1 360px' }}>
            <div className="h1" style={{ margin: 0 }}>{title}</div>
            <div className="muted" style={{ marginTop: 4 }}>
              {job.job_number ? `#${job.job_number} - ` : ''}{statusLabel(job.status)} - {fmtDate(job.scheduled_at)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="pill">{techName}</span>
            {job.amount ? <span className="pill" style={{ color: 'var(--green)' }}>{money(job.amount)}</span> : null}
            <span className="pill" style={{ color: photos.length ? 'var(--amber)' : 'var(--fg-3)' }}>{photos.length} photos</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 16 }}>
          <div>
            <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em' }}>Customer</div>
            <div style={{ fontWeight: 800, marginTop: 4 }}>{customer.name || 'Customer'}</div>
            {customer.phone && <a href={`tel:${String(customer.phone).replace(/[^0-9+]/g, '')}`} style={{ display: 'block', marginTop: 4 }}>{customer.phone}</a>}
            {customer.email && <div className="muted" style={{ marginTop: 3 }}>{customer.email}</div>}
          </div>
          <div>
            <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em' }}>Address</div>
            {customer.address ? (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customer.address)}`}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'block', marginTop: 4, lineHeight: 1.35 }}
              >
                {customer.address}
              </a>
            ) : (
              <div className="muted" style={{ marginTop: 4 }}>No address</div>
            )}
          </div>
          <div>
            <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em' }}>Photo spine</div>
            <div style={{ marginTop: 4, lineHeight: 1.4 }}>
              Before, during, after, receipts, damage, equipment, and closeout proof all attach here.
            </div>
          </div>
        </div>
      </div>

      {photoError && (
        <div className="notice">
          <strong>Photo table is not ready.</strong> Run <code>supabase/23_job_photo_spine.sql</code> in Supabase.
          <div className="muted" style={{ marginTop: 6 }}>{photoError.message}</div>
        </div>
      )}

      {/* CLOSEOUT GATE — required media must be present + pass QA before the job can close. */}
      {!photoError && (
        <div className="card" style={{ marginTop: 10, borderLeft: `3px solid ${closeout.readyToClose ? 'var(--green)' : 'var(--amber)'}`, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 240px' }}>
            <span style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: closeout.readyToClose ? 'color-mix(in oklab, var(--green) 18%, transparent)' : 'color-mix(in oklab, var(--amber) 18%, transparent)' }}>
              {closeout.readyToClose ? <CircleCheck size={22} style={{ color: 'var(--green)' }} /> : <Lock size={20} style={{ color: 'var(--amber)' }} />}
            </span>
            <div>
              <div style={{ fontWeight: 800 }}>Closeout Gate</div>
              <div className="muted" style={{ fontSize: 11.5 }}>All required media must be uploaded and pass QA before this job can be marked complete.</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="pill" style={{ color: closeout.photoCount >= closeout.minPhotos ? 'var(--green)' : 'var(--fg-2)' }}>{closeout.photoCount}/{closeout.minPhotos} photos</span>
            {closeout.requireVideo && <span className="pill" style={{ color: closeout.haveVideo ? 'var(--green)' : 'var(--fg-2)' }}>{closeout.haveVideo ? '1' : '0'}/1 video</span>}
            {closeout.openFails > 0 && <span className="pill pill-red">{closeout.openFails} failed</span>}
            <span className="pill" style={{ fontWeight: 800, background: closeout.readyToClose ? 'rgba(70,193,120,.16)' : 'rgba(255,179,0,.14)', color: closeout.readyToClose ? 'var(--green)' : 'var(--amber)' }}>
              {isDone ? 'Closed' : closeout.readyToClose ? 'Ready to close' : 'Blocked'}
            </span>
          </div>
          {!closeout.readyToClose && closeout.missing.length > 0 && (
            <div className="muted" style={{ fontSize: 11.5, flexBasis: '100%', display: 'flex', alignItems: 'center', gap: 5 }}>
              <CircleAlert size={13} style={{ color: 'var(--amber)' }} /> Still needed: {closeout.missing.join(', ')}.
            </div>
          )}
        </div>
      )}

      {!photoError && <CloseoutV2 jobId={id} dispo={dispo} needWarranty={needWarranty} />}

      <JobPhotos
        jobId={id}
        photos={photos}
        reviewByPhoto={reviewByPhoto}
        closeout={closeout}
        canUpload={canUpload && !photoError}
        canArchive={canArchiveAny}
        canReview={canReview && !photoError}
        canOverride={canOverride && !photoError}
        isDone={isDone}
        currentUserId={user.id}
      />
    </div>
  );
}
