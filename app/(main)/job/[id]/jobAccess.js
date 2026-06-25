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

export async function loadJob(sb, jobId) {
  const base = 'id, status, priority, scheduled_at, tech_id, customer_id';
  const relations = ', customers(name, address, phone, email), techs(name)';
  const withDispatchFields = `${base}, job_number, job_type, amount, tech_name, tech_email, enroute_at, started_at, completed_at, notes, access_notes, job_class, estimate_outcome, dispatchme_job_id, converted_to_job_id, converted_from_job_id, material_cost_cents, dispatch_fee_cents${relations}`;
  const fallback = `${base}${relations}`;

  let res = await sb.from('jobs').select(withDispatchFields).eq('id', jobId).maybeSingle();
  if (res.error && /column .* does not exist/i.test(res.error.message || '')) {
    res = await sb.from('jobs').select(fallback).eq('id', jobId).maybeSingle();
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
