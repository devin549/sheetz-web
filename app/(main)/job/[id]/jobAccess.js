import { can } from '@/lib/roles';

function todayKey() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

function sameName(a, b) {
  const aa = norm(a);
  const bb = norm(b);
  return Boolean(aa && bb && (aa === bb || aa.includes(bb) || bb.includes(aa)));
}

// A missing column shows up two different ways depending on PG vs PostgREST's cache:
//   "column jobs.x does not exist"  OR  "Could not find the 'x' column ... in the schema cache"
// Either one must trigger a graceful fallback — never a hard 404 of the whole cockpit.
function isMissingColumn(err) {
  const m = String(err?.message || '');
  return /column .* does not exist|could not find the .* column|schema cache/i.test(m);
}

export async function loadJob(sb, jobId) {
  const base = 'id, status, priority, scheduled_at, tech_id, customer_id';
  const relations = ', customers(name, address, phone, email, type, tags, do_not_service, cb_number, lifetime_jobs, last_job_completed), techs(name)';
  // Tier 1: everything. Tier 2: drop the newest cost columns (migration 73 may not be live yet)
  // but keep all the rich dispatch fields. Tier 3: bare base — last resort so the page still renders.
  // must_tell_tech / customer_promise / arrival_window / triage = the field-context the cockpit header surfaces.
  const richFields = ', job_number, job_type, amount, tech_name, tech_email, enroute_at, started_at, completed_at, notes, access_notes, must_tell_tech, customer_promise, arrival_window, triage, job_class, estimate_outcome, dispatchme_job_id, converted_to_job_id, converted_from_job_id, project_id, project_unit_id, lat, lng';
  const costFields = ', material_cost_cents, dispatch_fee_cents, sub_cost_cents, sub_vendor, sub_verified';
  const tiers = [
    `${base}${richFields}${costFields}${relations}`,
    `${base}${richFields}${relations}`,
    `${base}${relations}`,
  ];

  let res;
  for (const sel of tiers) {
    res = await sb.from('jobs').select(sel).eq('id', jobId).maybeSingle();
    if (!res.error || !isMissingColumn(res.error)) break; // real data, or a non-column error → stop
  }
  return res;
}

export async function canViewJob(sb, user, profile, role, job) {
  if (!user || !job) return false;
  if (can(role, 'seeAllJobs') || can(role, 'seeQueue') || can(role, 'seeCrew')) return true;

  const email = norm(user.email || profile?.email);
  const name = norm(user.user_metadata?.name || profile?.name);
  const techName = job.tech_name || job.techs?.name;
  const myTechId = profile?.tech_id || null;

  if (can(role, 'seeOwnOnly')) {
    if (myTechId && job.tech_id && String(job.tech_id) === String(myTechId)) return true; // exact tech_id link
    if (email && norm(job.tech_email) === email) return true;
    if (sameName(techName, name)) return true;
  }

  if (role === 'helper' && email) {
    const { data } = await sb
      .from('helper_assignments')
      .select('tech_email, tech_name')
      .eq('date_key', todayKey())
      .ilike('helper_email', email)
      .order('created_at', { ascending: false })
      .limit(1);
    const pair = data && data[0];
    if (pair && norm(pair.tech_email) && norm(pair.tech_email) === norm(job.tech_email)) return true;
    if (pair && sameName(pair.tech_name, techName)) return true;
  }

  return false;
}

export function canUploadPhotos(role) {
  return can(role, 'changeStatus') ||
    can(role, 'createJobs') ||
    can(role, 'assignJobs') ||
    can(role, 'seeOwnOnly') ||
    can(role, 'seeCrew');
}

export function canArchivePhoto(role, userId, photo) {
  return can(role, 'deleteJobs') ||
    can(role, 'manageUsers') ||
    can(role, 'assignJobs') ||
    Boolean(photo?.uploaded_by && userId && photo.uploaded_by === userId);
}

export function jobTitle(job) {
  return job?.job_type || job?.customers?.name || 'Job';
}
