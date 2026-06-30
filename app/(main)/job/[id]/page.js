import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import { can } from '@/lib/roles';
import { computeCloseout, getDispo, getParts, getForms, isEstimateJob, ruleForJob } from '@/lib/qa';
import JobPhotos from './JobPhotos';
import CloseoutV2 from './CloseoutV2';
import CompletionSignature from './CompletionSignature';
import { getLegalTerms } from '@/lib/estimateTerms';
import JobParts from './JobParts';
import JobForms from './JobForms';
import JobFlow from './JobFlow';
import MessageOffice from './MessageOffice';
import ReferToSales from './ReferToSales';
import EstimatePanel from './EstimatePanel';
import DispatchMeRef from './DispatchMeRef';
import JobCosts from './JobCosts';
import JobVideo from './JobVideo';
import CustomerMemory from './CustomerMemory';
import LinkToProject from './LinkToProject';
import JobActionCards from './JobActionCards';
import RollOverCard from './RollOverCard';
import OfficeTags from './OfficeTags';
import JobHeader from './JobHeader';
import { loadCustomerMemory } from '@/lib/customerMemory';
import { canArchivePhoto, canUploadPhotos, canViewJob, segmentTechHere, jobTitle, loadJob } from './jobAccess';
import ScanReceipt from './ScanReceipt';
import JobSegments from './JobSegments';
import { rollupJob } from '@/lib/segments';
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
  const isEstimate = isEstimateJob(job);
  const isVid = (p) => /^video\//.test(p.mime_type || '') || p.kind === 'walkthrough';
  const videos = photos.filter(isVid);
  const stillPhotos = photos.filter((p) => !isVid(p));
  const closeout = computeCloseout({ photos, reviews, rule: ruleForJob(job) });
  const dispo = await getDispo(sb, id, job);
  const parts = await getParts(sb, id);
  const forms = await getForms(sb, id, job.job_type);
  const memory = await loadCustomerMemory(sb, job);
  // Project linkage (if this job is a visit on a project) — name + unit label for the cockpit control.
  let projName = null, unitLabel = null;
  if (job.project_id) {
    try { const { data: pj } = await sb.from('projects').select('name').eq('id', job.project_id).maybeSingle(); projName = pj?.name || null; } catch (_) {}
    if (job.project_unit_id) { try { const { data: un } = await sb.from('project_units').select('label').eq('id', job.project_unit_id).maybeSingle(); unitLabel = un?.label || null; } catch (_) {} }
  }
  const needWarranty = ['warranty', 'insurance'].includes(String(job.job_class || '').toLowerCase()) || !!job.warranty_provider;

  // Latest sent estimate for this job → show its outcome on the cockpit overview, so an accept/deny lands on
  // the work order itself (not only the Pricebook tab's live mirror). Best-effort; empty pre-migration.
  let latestEstimate = null;
  try {
    const { data } = await sb.from('pricebook_estimates')
      .select('token, headline, subtotal, status, approved_name, decline_reason, responded_at, created_at')
      .eq('job_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    latestEstimate = data || null;
  } catch (_) {}

  // Crew & segments rollup (P8) — fail-soft if migration 87 isn't applied yet.
  let segments = [], jobReceipts = [];
  try { const { data } = await sb.from('job_segments').select('*').eq('parent_job_id', id).order('created_at', { ascending: true }); segments = data || []; } catch (_) {}
  try { const { data } = await sb.from('job_receipts').select('id, total_cents, billable, segment_id').eq('parent_job_id', id); jobReceipts = data || []; } catch (_) {}
  const rollup = rollupJob({ job, segments, receipts: jobReceipts, photos, now: Date.now() });
  const canDispatchSeg = can(role, 'assignJobs') || can(role, 'manageUsers') || can(role, 'seeCrew') || can(role, 'reassignJobs');

  const customer = job.customers || {};
  // Office-billed account? (net terms 132 + bill-from-office 135) — tells the close-out the tech collects
  // nothing; the office invoices. Best-effort; netDays = the office invoice due window.
  let officeBilled = false, netDays = 0;
  if (job.customer_id) {
    try { const { data: ct } = await sb.from('customers').select('net_terms_days, bill_from_office').eq('id', job.customer_id).maybeSingle(); netDays = Number(ct?.net_terms_days) || 0; officeBilled = !!ct?.bill_from_office || netDays > 0; }
    catch (_) { try { const { data: ct } = await sb.from('customers').select('net_terms_days').eq('id', job.customer_id).maybeSingle(); netDays = Number(ct?.net_terms_days) || 0; officeBilled = netDays > 0; } catch (_2) { /* pre-132 */ } }
  }
  const techName = job.tech_name || job.techs?.name || 'Unassigned';
  let completionTerms = ''; try { completionTerms = (await getLegalTerms(sb, 'completion_acceptance')).content; } catch (_) {}
  const title = jobTitle(job);
  const canUpload = canUploadPhotos(role);
  const canArchiveAny = can(role, 'deleteJobs') || can(role, 'manageUsers') || can(role, 'assignJobs');
  const canReview = can(role, 'qaReview');
  const canOverride = can(role, 'qaOverride');
  const isDone = /done|complete|closed/.test(String(job.status || '').toLowerCase());
  // Gate badge reflects media/QA + outstanding rentals (the disposition checklist shows its own state below).
  const partsBlocked = (parts.outRentals || []).length > 0;
  const formsBlocked = !isEstimate && forms.available !== false && !forms.ready; // estimates skip closeout questions
  const outcomeBlocked = isEstimate && !job.estimate_outcome;
  const gateReady = closeout.readyToClose && !partsBlocked && !formsBlocked && !outcomeBlocked;
  const gateMissing = [...(closeout.readyToClose ? [] : closeout.missing), ...parts.missing, ...(isEstimate ? [] : (forms.missing || [])), ...(outcomeBlocked ? ['estimate outcome'] : [])];
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

  // 2nd-tech LOCK — a tech added to this job via a segment gets photos + receipts ONLY; the lead/office own
  // status, pricing, and closeout. (Helpers are excluded — we don't hand them the photo/receipt duty, or the
  // lead gets lazy.) Deny-by-default: render just the proof tools, nothing that could change the job or sell.
  const isOfficeView = can(role, 'seeAllJobs') || can(role, 'seeQueue') || can(role, 'seeCrew');
  const isLeadTech = !!(profile?.tech_id && job.tech_id && String(job.tech_id) === String(profile.tech_id));
  const proofOnly = !isOfficeView && !isLeadTech && await segmentTechHere(sb, profile, id);
  if (proofOnly) {
    return (
      <div className="wrap" style={{ maxWidth: 1040 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href="/my-day" className="muted" style={{ fontSize: 12 }}>My Day</Link>
        </div>
        <JobHeader job={job} customer={customer} tab="Overview" />
        <div className="card card-amber" style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 800 }}>➕ You’re the 2nd tech on this job</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>Add your <strong>photos and receipts</strong> here — that’s your part. <strong>{techName}</strong> runs the job (status, pricing, closeout). Commission splits 50/50.</div>
        </div>
        <ScanReceipt jobId={id} dispatchCents={job.dispatch_fee_cents} />
        <div id="photos" style={{ scrollMarginTop: 70 }} />
        <JobPhotos jobId={id} photos={stillPhotos} reviewByPhoto={reviewByPhoto} closeout={closeout} canUpload={canUpload && !photoError} canArchive={canArchiveAny} canReview={false} canOverride={false} isDone={isDone} currentUserId={user.id} />
      </div>
    );
  }

  return (
    <div className="wrap" style={{ maxWidth: 1040 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Link href="/my-day" className="muted" style={{ fontSize: 12 }}>My Day</Link>
        <span className="muted">/</span>
        <Link href="/board" className="muted" style={{ fontSize: 12 }}>Board</Link>
      </div>

      {/* HTML work-order top: rich header — name · #job · address+turn-by-turn · Call(REC)/Text/CSR/
          Directions action bar · customer notes · the tab rail. (Replaces the old plain title card.) */}
      <JobHeader job={job} customer={customer} tab="Overview" />

      {/* slim status strip — estimate · tech · ticket · photos · DispatchMe ref */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
        {isEstimate && <span className="pill" style={{ color: 'var(--amber)', border: '1px solid var(--amber-dim)', fontWeight: 800 }}>🧲 ESTIMATE</span>}
        <span className="pill">{techName}</span>
        {job.amount ? <span className="pill" style={{ color: 'var(--green)' }}>{money(job.amount)}</span> : null}
        <span className="pill" style={{ color: photos.length ? 'var(--amber)' : 'var(--fg-3)' }}>{photos.length} photos</span>
        <DispatchMeRef jobId={id} value={job.dispatchme_job_id} canEdit={can(role, 'assignJobs') || can(role, 'manageUsers') || can(role, 'createJobs')} />
      </div>

      {/* Failed-QA alert — immediate, top-of-job, when a photo failed and the job isn't closed. */}
      {!photoError && closeout.openFails > 0 && !isDone && (
        <a href="#photos" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '11px 13px', borderRadius: 10, border: '1px solid var(--red)', background: 'rgba(239,83,80,.10)' }}>
          <CircleAlert size={17} style={{ color: 'var(--red)' }} />
          <span style={{ fontWeight: 800, color: 'var(--red)', fontSize: 13 }}>{closeout.openFails} photo{closeout.openFails > 1 ? 's' : ''} failed QA</span>
          <span className="muted" style={{ fontSize: 12 }}>— see the circle + note below, fix &amp; re-shoot.</span>
          <span style={{ marginLeft: 'auto', color: 'var(--red)', fontWeight: 800, fontSize: 12 }}>Fix ↓</span>
        </a>
      )}

      {/* (Customer context / notes now render inside JobHeader above — no duplicate here.) */}
      <div id="customer" style={{ scrollMarginTop: 70 }}><CustomerMemory mem={memory} customer={customer} job={job} /></div>

      <JobActionCards jobId={id} jobNumber={job.job_number} customerName={customer.name} jobType={job.job_type} status={job.status} canAct={canAct} />

      {/* 🏷 Office tags — dispatch sets them (tech sees on My Day; ✨ tags attach a form). Read-only for techs. */}
      <OfficeTags jobId={id} tags={job.office_tags || []} canEdit={can(role, 'assignJobs') || can(role, 'manageUsers') || can(role, 'seeCrew') || can(role, 'createJobs')} />

      <JobFlow jobId={id} status={st} reached={reached} gateReady={gateReady} gateMissing={gateMissing} nextHint={gateMissing[0] || ''} canAct={canAct} />

      {/* 🧾 Sent-estimate outcome — lands the customer's accept/deny on the work order itself (not just the
          Pricebook tab). Reads the latest estimate for this job. */}
      {latestEstimate && (() => {
        const s = String(latestEstimate.status || 'sent').toLowerCase();
        const MAP = {
          sent: { icon: '📤', label: 'Sent — waiting for the customer', color: 'var(--fg-3)' },
          viewed: { icon: '👀', label: 'Customer is viewing it', color: 'var(--amber)' },
          question: { icon: '💬', label: 'Customer asked a question', color: 'var(--amber)' },
          deposit_requested: { icon: '💳', label: 'Customer wants to put a deposit down', color: 'var(--amber)' },
          approved: { icon: '✅', label: `Approved${latestEstimate.approved_name ? ` by ${latestEstimate.approved_name}` : ''}`, color: 'var(--green)' },
          declined: { icon: '🙅', label: `Declined${latestEstimate.decline_reason ? ` — "${String(latestEstimate.decline_reason).slice(0, 80)}"` : ''}`, color: 'var(--red)' },
        };
        const m = MAP[s] || MAP.sent;
        const terminal = s === 'approved' || s === 'declined';
        return (
          <Link href={`/job/${id}/pricebook`} className="card" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit', borderLeft: `3px solid ${m.color}` }}>
            <span style={{ fontSize: 18 }}>{m.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: m.color }}>Estimate {m.label}</div>
              <div className="muted" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{latestEstimate.headline || 'Quote'}{latestEstimate.subtotal ? ` · ${money(latestEstimate.subtotal)}` : ''}{!terminal ? ' · live' : ''}</div>
            </div>
            <span style={{ color: 'var(--amber)', fontWeight: 800, flexShrink: 0 }}>›</span>
          </Link>
        );
      })()}

      {/* Crew & segments (split / second tech / helper / parts run / return visit / unit) — rolls up here. */}
      <JobSegments parentJobId={id} rollup={rollup} segments={segments} canDispatch={canDispatchSeg} />

      {(canAct || job.project_id) && <LinkToProject jobId={id} currentProjectId={job.project_id} currentProjectName={projName} currentUnitLabel={unitLabel} canLink={can(role, 'assignJobs') || can(role, 'createJobs') || can(role, 'manageUsers')} />}

      {canAct && <div style={{ marginTop: 8 }}><MessageOffice jobId={id} /></div>}

      {/* 💡 Refer a bigger opportunity (FloodBusterz / Reline) to Sales — internal handoff, customer not contacted. */}
      {canAct && !isEstimate && <ReferToSales jobId={id} customerName={(customer && customer.name) || job.customer_name || ''} />}

      {isEstimate && <EstimatePanel jobId={id} outcome={job.estimate_outcome} convertedToJobId={job.converted_to_job_id} canAct={canAct} />}

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

      {!isEstimate && <JobForms jobId={id} forms={forms} canAnswer={canAnswerForms} />}

      <JobParts jobId={id} parts={parts} canReturn={canReturnRentals} />

      {!isEstimate && <JobCosts jobId={id} materialCents={job.material_cost_cents} dispatchCents={job.dispatch_fee_cents} subCents={job.sub_cost_cents} subVendor={job.sub_vendor} subVerified={job.sub_verified} canEdit={canAct || can(role, 'collectPayment') || can(role, 'seeFinancials')} revenue={Number(job.amount) || 0} roastLevel={profile.roastLevel || 'PG'} name={profile.name || ''} />}

      <div id="photos" style={{ scrollMarginTop: 70 }} />

      {/* Guided shots — required photo kinds + walkthrough video from the job_media_rules, so the tech
          knows shot-by-shot what gates closeout (HTML "Guided photos · X/Y" + "Video evidence REQUIRED"). */}
      {!photoError && closeout.available !== false && (closeout.requiredKinds?.length > 0 || closeout.requireVideo || closeout.minPhotos > 0) && (() => {
        const missing = new Set(closeout.missingKinds || []);
        const kinds = closeout.requiredKinds || [];
        return (
          <div className="card" style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 16 }}>📸</span>
              <div style={{ fontWeight: 800 }}>Required shots</div>
              <span className="pill" style={{ marginLeft: 'auto', color: closeout.readyToClose ? 'var(--green)' : 'var(--amber)' }}>{closeout.photoCount}/{closeout.minPhotos} photos</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {kinds.map((k) => {
                const ok = !missing.has(k);
                return (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
                    {ok ? <CircleCheck size={15} style={{ color: 'var(--green)' }} /> : <CircleAlert size={15} style={{ color: 'var(--amber)' }} />}
                    <span style={{ textTransform: 'capitalize', fontWeight: ok ? 600 : 800, color: ok ? 'var(--fg-2)' : 'var(--fg-1)' }}>{k} photo</span>
                  </div>
                );
              })}
              {closeout.requireVideo && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
                  {closeout.haveVideo ? <CircleCheck size={15} style={{ color: 'var(--green)' }} /> : <CircleAlert size={15} style={{ color: 'var(--amber)' }} />}
                  <span style={{ fontWeight: closeout.haveVideo ? 600 : 800, color: closeout.haveVideo ? 'var(--fg-2)' : 'var(--fg-1)' }}>🎬 Walkthrough video <span style={{ color: 'var(--red)', fontSize: 10, fontWeight: 800 }}>REQUIRED</span></span>
                </div>
              )}
            </div>
            <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>Required shots gate closeout — capture them below; the office checks each one pass/fail.</div>
          </div>
        );
      })()}

      {!photoError && !isEstimate && <CloseoutV2 jobId={id} dispo={dispo} needWarranty={needWarranty} officeBilled={officeBilled} netDays={netDays} />}
      {!photoError && !isEstimate && <CompletionSignature jobId={id} terms={completionTerms} signedName={dispo.row?.completion_signed_name} signedAt={dispo.row?.completion_signed_at} />}

      <JobVideo jobId={id} videos={videos} canUpload={canUpload && !photoError} requireVideo={closeout.requireVideo} />

      <JobPhotos
        jobId={id}
        photos={stillPhotos}
        reviewByPhoto={reviewByPhoto}
        closeout={closeout}
        canUpload={canUpload && !photoError}
        canArchive={canArchiveAny}
        canReview={canReview && !photoError}
        canOverride={canOverride && !photoError}
        isDone={isDone}
        currentUserId={user.id}
      />

      {/* 🏁 End of the job — bill it out or roll it over (moved here from the top, per Devin). */}
      {!isDone && <RollOverCard jobId={id} canAct={canAct} />}
    </div>
  );
}
