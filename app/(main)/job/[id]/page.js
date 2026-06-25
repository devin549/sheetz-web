import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import { can } from '@/lib/roles';
import { computeCloseout, getDispo, getParts, getForms } from '@/lib/qa';
import JobPhotos from './JobPhotos';
import CloseoutV2 from './CloseoutV2';
import JobParts from './JobParts';
import JobForms from './JobForms';
import JobFlow from './JobFlow';
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

// Prior jobs for this customer — the cockpit "History" tab so the tech knows the relationship
// (repeat customer, prior callbacks). Guarded by the same job access; best-effort.
async function loadHistory(sb, customerId, currentId) {
  if (!customerId) return [];
  try {
    const { data, error } = await sb.from('jobs')
      .select('id, job_number, job_type, amount, status, scheduled_at, completed_at')
      .eq('customer_id', customerId).neq('id', currentId)
      .order('scheduled_at', { ascending: false }).limit(8);
    return error ? [] : (data || []);
  } catch { return []; }
}

// Circle/box markers for the failing reviews → shown to the tech so they see WHERE the problem is.
async function loadAnnotations(sb, reviewIds) {
  if (!reviewIds.length) return {};
  const { data, error } = await sb
    .from('job_photo_annotations')
    .select('id, review_id, photo_id, shape, x, y, w, h, note')
    .in('review_id', reviewIds);
  if (error) return {}; // table optional
  const byPhoto = {};
  (data || []).forEach((a) => { (byPhoto[a.photo_id] = byPhoto[a.photo_id] || []).push(a); });
  return byPhoto;
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
  // Attach the circle(s) drawn on each failing review so the tech sees WHERE the problem is.
  const failReviewIds = Object.values(reviewByPhoto).filter((r) => r.result === 'fail').map((r) => r.id);
  const annoByPhoto = await loadAnnotations(sb, failReviewIds);
  Object.values(reviewByPhoto).forEach((r) => { r.annotations = annoByPhoto[r.photo_id] || []; });
  const closeout = computeCloseout({ photos, reviews });
  const dispo = await getDispo(sb, id, job);
  const parts = await getParts(sb, id);
  const forms = await getForms(sb, id, job.job_type);
  const history = await loadHistory(sb, job.customer_id, id);
  const needWarranty = ['warranty', 'insurance'].includes(String(job.job_class || '').toLowerCase()) || !!job.warranty_provider;

  const customer = job.customers || {};
  const techName = job.tech_name || job.techs?.name || 'Unassigned';
  const title = jobTitle(job);
  const canUpload = canUploadPhotos(role);
  const canArchiveAny = can(role, 'deleteJobs') || can(role, 'manageUsers') || can(role, 'assignJobs');
  const canReview = can(role, 'qaReview');
  const canOverride = can(role, 'qaOverride');
  const isDone = /done|complete|closed/.test(String(job.status || '').toLowerCase());
  // Gate badge reflects media/QA + outstanding rentals (the disposition checklist shows its own state below).
  const partsBlocked = (parts.outRentals || []).length > 0;
  const formsBlocked = forms.available !== false && !forms.ready;
  const gateReady = closeout.readyToClose && !partsBlocked && !formsBlocked;
  const gateMissing = [...(closeout.readyToClose ? [] : closeout.missing), ...parts.missing, ...(forms.missing || [])];
  const canReturnRentals = can(role, 'changeStatus') || can(role, 'manageInventory') || canUpload;
  const canAnswerForms = can(role, 'changeStatus') || can(role, 'qaReview') || canUpload;

  // Cockpit workflow rail — which of the 7 steps the job has reached (heuristic from real signals).
  const st = String(job.status || 'scheduled').toLowerCase();
  const payDone = !!(dispo.row && dispo.row.payment_disposition);
  const reached = {
    rolling: !!job.enroute_at || !!job.started_at || isDone || /enroute|rolling|on_site|onsite/.test(st),
    arrived: !!job.started_at || isDone || /on_site|onsite/.test(st),
    diagnose: !!job.started_at || isDone || /on_site|onsite/.test(st),
    present: payDone || isDone || !!(dispo.row && dispo.row.invoice_status && dispo.row.invoice_status !== 'none'),
    pay: payDone || isDone,
    photos: closeout.readyToClose,
    done: isDone,
  };
  const canAct = can(role, 'changeStatus');
  const urgent = /high|urgent|emergency/i.test(String(job.priority || ''));

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

      {/* Customer warnings — never lose context the tech needs before knocking. */}
      {urgent && (
        <div className="card" style={{ marginTop: 10, borderLeft: '3px solid var(--red)', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(239,83,80,.08)' }}>
          <CircleAlert size={16} style={{ color: 'var(--red)' }} />
          <span style={{ fontWeight: 800, color: 'var(--red)', fontSize: 13 }}>{String(job.priority).toUpperCase()} priority</span>
          <span className="muted" style={{ fontSize: 12 }}>— handle first.</span>
        </div>
      )}

      {/* Notes & Access — gate code, dog, parking, lockbox + job notes (jobs.access_notes / jobs.notes). */}
      {(job.access_notes || job.notes) && (
        <div className="card" style={{ marginTop: 10, borderLeft: '3px solid var(--amber)' }}>
          {job.access_notes && (
            <div>
              <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>🔑 Access &amp; warnings</div>
              <div style={{ marginTop: 4, fontSize: 13.5, lineHeight: 1.45, fontWeight: 600 }}>{job.access_notes}</div>
            </div>
          )}
          {job.notes && (
            <div style={{ marginTop: job.access_notes ? 10 : 0 }}>
              <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>🗂 Job notes</div>
              <div style={{ marginTop: 4, fontSize: 13, lineHeight: 1.45 }}>{job.notes}</div>
            </div>
          )}
        </div>
      )}

      <JobFlow jobId={id} status={st} reached={reached} gateReady={gateReady} gateMissing={gateMissing} nextHint={gateMissing[0] || ''} canAct={canAct} />

      {photoError && (
        <div className="notice">
          <strong>Photo table is not ready.</strong> Run <code>supabase/23_job_photo_spine.sql</code> in Supabase.
          <div className="muted" style={{ marginTop: 6 }}>{photoError.message}</div>
        </div>
      )}

      {/* CLOSEOUT GATE — required media must be present + pass QA before the job can close. */}
      {!photoError && (
        <div id="closeout-gate" className="card" style={{ scrollMarginTop: 70, marginTop: 10, borderLeft: `3px solid ${gateReady ? 'var(--green)' : 'var(--amber)'}`, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 240px' }}>
            <span style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: gateReady ? 'color-mix(in oklab, var(--green) 18%, transparent)' : 'color-mix(in oklab, var(--amber) 18%, transparent)' }}>
              {gateReady ? <CircleCheck size={22} style={{ color: 'var(--green)' }} /> : <Lock size={20} style={{ color: 'var(--amber)' }} />}
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
            {parts.outRentals && parts.outRentals.length > 0 && <span className="pill pill-red">{parts.outRentals.length} rental{parts.outRentals.length > 1 ? 's' : ''} out</span>}
            {formsBlocked && <span className="pill pill-red">{forms.missing.length} question{forms.missing.length > 1 ? 's' : ''}</span>}
            <span className="pill" style={{ fontWeight: 800, background: gateReady ? 'rgba(70,193,120,.16)' : 'rgba(255,179,0,.14)', color: gateReady ? 'var(--green)' : 'var(--amber)' }}>
              {isDone ? 'Closed' : gateReady ? 'Ready to close' : 'Blocked'}
            </span>
          </div>
          {!gateReady && gateMissing.length > 0 && (
            <div className="muted" style={{ fontSize: 11.5, flexBasis: '100%', display: 'flex', alignItems: 'center', gap: 5 }}>
              <CircleAlert size={13} style={{ color: 'var(--amber)' }} /> Still needed: {gateMissing.join(', ')}.
            </div>
          )}
        </div>
      )}

      <JobForms jobId={id} forms={forms} canAnswer={canAnswerForms} />

      <JobParts jobId={id} parts={parts} canReturn={canReturnRentals} />

      {/* History — this customer's prior jobs, so the tech knows the relationship. */}
      {history.length > 0 && (
        <div className="card" style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 16 }}>📜</span>
            <div style={{ fontWeight: 800 }}>History · this customer</div>
            <span className="pill" style={{ marginLeft: 'auto' }}>{history.length} prior</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {history.map((h) => (
              <Link key={h.id} href={`/job/${h.id}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <span className="muted" style={{ fontSize: 11, minWidth: 96 }}>{fmtDate(h.completed_at || h.scheduled_at)}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.job_type || 'Job'}{h.job_number ? ` · #${h.job_number}` : ''}</span>
                {h.amount ? <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 700 }}>{money(h.amount)}</span> : null}
                <span className="pill" style={{ fontSize: 10 }}>{statusLabel(h.status)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div id="photos" style={{ scrollMarginTop: 70 }} />

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
