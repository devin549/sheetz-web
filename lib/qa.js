// Closeout + QA logic, shared by the supervisor screen, the job file, and the close-gate.
// Server-side (takes a service-role client). Everything is GUARDED: if the QA/photo tables
// aren't there yet, closeout evaluation FAILS OPEN (readyToClose=true) so completes never lock
// up before the migrations are run.

export const FAIL_REASONS = [
  { code: 'blurry', label: 'Blurry / unclear' },
  { code: 'wrong_area', label: 'Wrong area' },
  { code: 'no_after_proof', label: 'No after proof' },
  { code: 'unfinished', label: 'Work unfinished' },
  { code: 'missing_equipment', label: 'Missing equipment' },
  { code: 'customer_issue', label: 'Customer-facing issue' },
  { code: 'other', label: 'Other' },
];
export const FAIL_LABEL = Object.fromEntries(FAIL_REASONS.map((r) => [r.code, r.label]));

const DEFAULT_RULE = { min_photos: 3, required_kinds: ['before', 'after'], require_video: false };
const isVideo = (p) => /^video\//.test(p.mime_type || '') || p.kind === 'walkthrough';

async function loadRuleFor(sb, jobType) {
  try {
    const { data, error } = await sb
      .from('job_media_rules').select('min_photos, required_kinds, require_video')
      .in('job_type', [jobType || '*', '*']).order('job_type', { ascending: false });
    if (error || !data || !data.length) return DEFAULT_RULE;
    return data[0]; // exact job_type sorts before '*'
  } catch { return DEFAULT_RULE; }
}

// Latest review per photo from a desc-ordered list.
function latestPerPhoto(rows) {
  const seen = new Set(), out = [];
  for (const r of rows || []) { if (seen.has(r.photo_id)) continue; seen.add(r.photo_id); out.push(r); }
  return out;
}

// Pure: given a job's photos + latest reviews + the rule, what's the closeout state?
export function computeCloseout({ photos = [], reviews = [], rule }) {
  const r = rule || DEFAULT_RULE;
  const kinds = new Set(photos.map((p) => p.kind));
  const photoCount = photos.filter((p) => !isVideo(p)).length;
  const haveVideo = photos.some(isVideo);
  const missingKinds = (r.required_kinds || []).filter((k) => !kinds.has(k));
  const failIds = new Set((reviews || []).filter((rv) => rv.result === 'fail').map((rv) => rv.photo_id));
  const openFails = photos.filter((p) => failIds.has(p.id)).length;
  const reviewedCount = (reviews || []).length;

  const missing = [];
  if (photoCount < r.min_photos) missing.push(`${r.min_photos - photoCount} more photo${r.min_photos - photoCount > 1 ? 's' : ''}`);
  missingKinds.forEach((k) => missing.push(`${k} photo`));
  if (r.require_video && !haveVideo) missing.push('walkthrough video');
  if (openFails) missing.push(`fix ${openFails} failed photo${openFails > 1 ? 's' : ''}`);

  const readyToClose = missing.length === 0;
  const qaState = openFails ? 'fail'
    : (photos.length > 0 && reviewedCount >= photos.length) ? 'pass'
    : reviewedCount ? 'partial' : 'pending';

  return { available: true, photoCount, haveVideo, minPhotos: r.min_photos, requireVideo: r.require_video, requiredKinds: r.required_kinds, missingKinds, openFails, reviewedCount, qaState, missing, readyToClose };
}

// Single job → closeout state (guarded; fail-open if tables missing).
export async function getCloseout(sb, job) {
  try {
    const rule = await loadRuleFor(sb, job.job_type);
    const pr = await sb.from('job_photos').select('id, kind, mime_type').is('deleted_at', null).eq('job_id', job.id);
    if (pr.error) return { available: false, readyToClose: true, missing: [], qaState: 'pending' };
    const photos = pr.data || [];
    let reviews = [];
    if (photos.length) {
      const rv = await sb.from('job_photo_reviews').select('id, photo_id, result, created_at')
        .in('photo_id', photos.map((p) => p.id)).order('created_at', { ascending: false });
      if (!rv.error) reviews = latestPerPhoto(rv.data);
    }
    return computeCloseout({ photos, reviews, rule });
  } catch { return { available: false, readyToClose: true, missing: [], qaState: 'pending' }; }
}

// Gate helper: returns a blocking reason string, or null if the job may go 'done'.
export async function closeoutReason(sb, job) {
  const c = await getCloseout(sb, job);
  if (c.available === false || c.readyToClose) return null;
  return 'Closeout incomplete — ' + c.missing.join(', ') + '.';
}

// Batch (supervisor screen): jobs:[{id, job_type}] → { [jobId]: closeoutState }.
export async function loadCloseoutBatch(sb, jobs) {
  const out = {};
  jobs.forEach((j) => { out[j.id] = { available: false, readyToClose: true, missing: [], qaState: 'pending', photoCount: 0 }; });
  const ids = jobs.map((j) => j.id);
  if (!ids.length) return out;
  try {
    const rule = DEFAULT_RULE; // per-type refinement can come later; default covers the screen
    const pr = await sb.from('job_photos').select('id, job_id, kind, mime_type').is('deleted_at', null).in('job_id', ids);
    if (pr.error) return out; // tables not ready → leave fail-open defaults
    const byJob = {}; ids.forEach((id) => { byJob[id] = { photos: [], reviews: [] }; });
    (pr.data || []).forEach((p) => { if (byJob[p.job_id]) byJob[p.job_id].photos.push(p); });
    const photoIds = (pr.data || []).map((p) => p.id);
    if (photoIds.length) {
      const rv = await sb.from('job_photo_reviews').select('id, photo_id, job_id, result, created_at')
        .in('photo_id', photoIds).order('created_at', { ascending: false });
      if (!rv.error) latestPerPhoto(rv.data).forEach((r) => { if (byJob[r.job_id]) byJob[r.job_id].reviews.push(r); });
    }
    for (const j of jobs) out[j.id] = computeCloseout({ ...byJob[j.id], rule });
  } catch { /* leave defaults */ }
  return out;
}
