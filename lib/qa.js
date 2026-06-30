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

// Estimate / quote jobs get a LIGHTER gate: 1 issue photo, an equipment (model/serial) photo only when
// equipment is involved, no walkthrough video, no before/during/after. Closeout = estimate photo + outcome.
export const ESTIMATE_OUTCOMES = [
  { code: 'sold_now', label: 'Sold now' },
  { code: 'not_sold', label: 'Not sold' },
  { code: 'needs_follow_up', label: 'Needs follow-up' },
  { code: 'needs_parts', label: 'Needs parts' },
  { code: 'customer_not_ready', label: 'Customer not ready' },
];
export const ESTIMATE_OUTCOME_CODES = ESTIMATE_OUTCOMES.map((o) => o.code);
export function isEstimateJob(job) {
  const cls = String((job && job.job_class) || '').toLowerCase();
  const type = String((job && job.job_type) || '').toLowerCase();
  return cls === 'estimate' || cls === 'quote' || /\b(estimate|quote|bid)\b/.test(type);
}
export function estimateEquipmentInvolved(job) {
  return /water ?heater|furnace|boiler|tankless|softener|heat ?pump|condenser|\ba\/?c\b|hvac/i.test(String((job && job.job_type) || ''));
}
function estimateRule(job) {
  return { min_photos: 1, required_kinds: estimateEquipmentInvolved(job) ? ['equipment'] : [], require_video: false };
}
// Rule for the page's media display (estimate → light rule, else the 3-photo default).
export function ruleForJob(job) {
  return isEstimateJob(job) ? estimateRule(job) : DEFAULT_RULE;
}

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
    const rule = isEstimateJob(job) ? estimateRule(job) : await loadRuleFor(sb, job.job_type);
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

// ── Closeout v2 — disposition checklist (payment, signature, invoice, review, cash, warranty) ──
// Pure: given a job + its job_closeout row, what disposition items are required/done?
export function computeDispo(job, row) {
  const r = row || {};
  const needWarranty = ['warranty', 'insurance'].includes(String(job && job.job_class || '').toLowerCase()) || !!(job && job.warranty_provider);
  const isCash = r.payment_disposition === 'paid_cash';
  const items = [
    { key: 'payment', label: 'Payment disposition', ok: !!r.payment_disposition, required: true },
    { key: 'signature', label: 'Customer signed', ok: !!r.signed, required: true },
    { key: 'invoice', label: 'Invoice / receipt', ok: !!r.invoice_status && r.invoice_status !== 'none', required: true },
    { key: 'review', label: 'Review requested', ok: !!r.review_requested, required: true },
    { key: 'cash', label: 'Cash turned in', ok: r.cash_status === 'turned_in', required: isCash },
    { key: 'warranty', label: 'Warranty packet', ok: !!r.warranty_packet, required: needWarranty },
  ];
  const missing = items.filter((i) => i.required && !i.ok).map((i) => i.label);
  return { items, missing, ready: missing.length === 0 };
}

// Single job → disposition state (guarded; fail-open if the table is missing).
export async function getDispo(sb, jobId, jobMaybe) {
  try {
    const { data: row, error } = await sb.from('job_closeout').select('*').eq('job_id', jobId).maybeSingle();
    if (error) return { available: false, ready: true, missing: [], items: [], row: null };
    let job = jobMaybe;
    if (!job || job.job_class === undefined) {
      const jr = await sb.from('jobs').select('job_class, warranty_provider').eq('id', jobId).maybeSingle();
      job = { ...(jobMaybe || {}), ...(jr.data || {}) };
    }
    return { available: true, row: row || null, ...computeDispo(job, row || {}) };
  } catch { return { available: false, ready: true, missing: [], items: [], row: null }; }
}

// ── Parts & rentals gate ──────────────────────────────────────────────────────────────────────
// Parts ISSUED to a job are consumed (cost stays on the job) — they don't block closeout. But a
// RENTAL still 'out' must come back before the job can close: the tool's in the field and (for paid
// rentals) the daily rate keeps accruing. This closes the shop self-serve checkout loop at closeout.
export function computeParts(rows) {
  const items = rows || [];
  const outRentals = items.filter((r) => (r.kind === 'rental') && r.status !== 'returned');
  const missing = outRentals.length ? [`return ${outRentals.length} rental${outRentals.length > 1 ? 's' : ''}`] : [];
  return { available: true, items, outRentals, issued: items.filter((r) => r.kind !== 'rental'), missing, ready: missing.length === 0 };
}

// Single job → parts/rental state (guarded; fail-open if shop_issues isn't migrated).
export async function getParts(sb, jobId) {
  try {
    const { data, error } = await sb.from('shop_issues')
      .select('id, item_name, sku, qty, unit, kind, status, rental_daily_cents, rental_days, total_cost_cents, issued_to, created_at, returned_at')
      .eq('job_id', String(jobId)).order('created_at', { ascending: false });
    if (error) return { available: false, ready: true, missing: [], items: [], outRentals: [], issued: [] };
    return computeParts(data || []);
  } catch { return { available: false, ready: true, missing: [], items: [], outRentals: [], issued: [] }; }
}

// ── Closeout questions gate ────────────────────────────────────────────────────────────────────
// A per-job-type checklist (config in job_closeout_questions) the tech must answer before close.
// Config-driven: empty config (the default) blocks nothing. An unanswered required question — or one
// whose answer doesn't match its `must_be` — blocks closeout.
const answered = (v) => v !== undefined && v !== null && String(v).trim() !== '';
export function computeForms(questions, answers) {
  const qs = Array.isArray(questions) ? questions : [];
  const a = answers || {};
  const items = qs.map((q) => {
    const val = a[q.key];
    let ok = true;
    if (q.required && !answered(val)) ok = false;
    else if (q.must_be !== undefined && q.must_be !== null && String(q.must_be) !== '' && answered(val) && String(val).toLowerCase() !== String(q.must_be).toLowerCase()) ok = false;
    return { ...q, value: val, ok };
  });
  const missing = items.filter((i) => !i.ok).map((i) => i.prompt || i.key);
  return { available: true, items, answers: a, missing, ready: missing.length === 0 };
}

async function loadQuestions(sb, jobType) {
  try {
    const { data, error } = await sb.from('job_closeout_questions')
      .select('job_type, questions').in('job_type', [jobType || '*', '*']).order('job_type', { ascending: false });
    if (error) return null; // table missing → fail open
    if (!data || !data.length) return [];
    return data[0].questions || []; // exact job_type sorts before '*'
  } catch { return null; }
}

// Single job → closeout-questions state (guarded; fail-open if the tables are missing).
export async function getForms(sb, jobId, jobType) {
  const questions = await loadQuestions(sb, jobType);
  if (questions === null) return { available: false, ready: true, missing: [], items: [], answers: {} };
  if (!questions.length) return { available: true, ready: true, missing: [], items: [], answers: {} };
  let answers = {};
  try {
    const { data } = await sb.from('job_closeout_answers').select('answers').eq('job_id', String(jobId)).maybeSingle();
    answers = (data && data.answers) || {};
  } catch { /* leave empty */ }
  return computeForms(questions, answers);
}

// ── Correction work orders (QA Hold) ────────────────────────────────────────────────────────────
// Open corrections (failed proof escalated because the tech left) block full closeout until resolved
// or overridden. Guarded; fail-open if job_corrections isn't migrated.
export async function getCorrections(sb, jobId) {
  try {
    const { data, error } = await sb.from('job_corrections')
      .select('id, photo_id, fail_reason, manager_note, status, customer_contacted, created_at, created_by_name, correction_job_id')
      .eq('orig_job_id', String(jobId)).order('created_at', { ascending: false });
    if (error) return { available: false, open: [], all: [], ready: true };
    const all = data || [];
    const open = all.filter((c) => c.status === 'open');
    return { available: true, all, open, ready: open.length === 0 };
  } catch { return { available: false, open: [], all: [], ready: true }; }
}

// Gate helper: returns a blocking reason string, or null if the job may go 'done'. Enforces the
// media/QA gate, disposition checklist, outstanding rentals, closeout questions, AND open corrections
// (all fail open until their tables exist).
export async function closeoutReason(sb, job) {
  const reasons = [];
  const c = await getCloseout(sb, job);
  if (!(c.available === false || c.readyToClose)) reasons.push(c.missing.join(', '));

  // Estimate / quote jobs close on photo(s) + outcome — no disposition / parts / forms / video.
  if (isEstimateJob(job)) {
    if (!job.estimate_outcome) reasons.push('estimate outcome');
    const k = await getCorrections(sb, job.id);
    if (k.available !== false && !k.ready) reasons.push(`${k.open.length} open photo correction${k.open.length > 1 ? 's' : ''}`);
    if (!reasons.length) return null;
    return 'Estimate not ready — ' + reasons.filter(Boolean).join(', ') + '.';
  }

  const d = await getDispo(sb, job.id, job);
  if (d.available !== false && !d.ready) reasons.push(d.missing.join(', '));
  const p = await getParts(sb, job.id);
  if (p.available !== false && !p.ready) reasons.push(p.missing.join(', '));
  const f = await getForms(sb, job.id, job.job_type);
  if (f.available !== false && !f.ready) reasons.push(f.missing.join(', '));
  const k = await getCorrections(sb, job.id);
  if (k.available !== false && !k.ready) reasons.push(`${k.open.length} open photo correction${k.open.length > 1 ? 's' : ''}`);

  // Margin gate (audit): block a clearly UNDERWATER close — material cost exceeds the price, i.e. the job
  // loses money. Only the egregious case (not normal low-but-positive margin, which would disrupt the field),
  // and only when cost data exists (mig 73). qaOverride roles already bypass closeoutReason, so a MANAGER can
  // still close it after a look; this just stops a tech from quietly closing a money-loser.
  const mat = Number(job.material_cost_cents) > 0 ? Number(job.material_cost_cents) / 100 : null;
  const rev = Number(job.amount) || 0;
  if (mat != null && rev > 0 && mat > rev) reasons.push(`underwater: $${Math.round(mat).toLocaleString()} material on a $${Math.round(rev).toLocaleString()} job — a manager must close it`);

  if (!reasons.length) return null;
  return 'Closeout incomplete — ' + reasons.filter(Boolean).join(', ') + '.';
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
