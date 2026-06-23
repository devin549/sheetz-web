import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import { can } from '@/lib/roles';
import JobPhotos from './JobPhotos';
import { canArchivePhoto, canUploadPhotos, canViewJob, jobTitle, loadJob } from './jobAccess';

export const dynamic = 'force-dynamic';

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
  const { user, role } = await requirePerm('seeAllJobs', 'seeQueue', 'seeOwnOnly', 'seeCrew');
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
  if (!(await canViewJob(sb, user, role, job))) notFound();

  const { photos, error: photoError } = await loadPhotos(sb, id);
  const customer = job.customers || {};
  const techName = job.tech_name || job.techs?.name || 'Unassigned';
  const title = jobTitle(job);
  const canUpload = canUploadPhotos(role);
  const canArchiveAny = can(role, 'deleteJobs') || can(role, 'manageUsers') || can(role, 'assignJobs');

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

      <JobPhotos
        jobId={id}
        photos={photos}
        canUpload={canUpload && !photoError}
        canArchive={canArchiveAny}
        currentUserId={user.id}
      />
    </div>
  );
}
