'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { postToDiscord } from '@/lib/discord';

const BUCKET = 'job-photos';
const clean = (v, n = 500) => String(v == null ? '' : v).trim().slice(0, n);
const missing = (e) => /relation|column|schema cache|does not exist/i.test(e?.message || '');
const TYPE = { fb: { label: 'FloodBusterz', icon: '🌊' }, reline: { label: 'Reline', icon: '🔧' } };

async function ctx() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: 'Sign in required.' };
  const profile = await loadProfile(user);
  // Anyone who works a job can flag an opportunity (techs/helpers/FS/foreman + office).
  if (!(can(profile.role, 'changeStatus') || can(profile.role, 'seeOwnOnly') || can(profile.role, 'seeCrew') || can(profile.role, 'seeAllJobs')))
    return { err: 'Not allowed.' };
  return { user, profile, sb: getSupabaseAdmin() };
}

// Attach a damage photo to a pending referral — uploads to the private bucket, returns the storage path.
export async function uploadReferralPhoto(formData) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const jobId = clean(formData.get('jobId'), 80) || 'misc';
  const file = formData.get('photo');
  if (!file || typeof file.arrayBuffer !== 'function') return { ok: false, msg: 'Take a photo first.' };
  if (!/^image\//.test(file.type || '')) return { ok: false, msg: 'Photos only.' };
  if (file.size > 10 * 1024 * 1024) return { ok: false, msg: 'Photo is over 10 MB.' };
  const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const path = `sales-referrals/${jobId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error } = await c.sb.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });
  if (error) return { ok: false, msg: error.message };
  return { ok: true, path };
}

// Hand an opportunity to Sales (FloodBusterz / Reline). Logs it + pings the office. Customer NOT contacted.
export async function submitReferral({ jobId, refType, note, urgent, photoPaths, customerName }) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const t = TYPE[refType] ? refType : 'fb';
  const n = clean(note, 1200);
  if (!n) return { ok: false, msg: 'Add a quick note on what you saw so Sales knows what they’re walking into.' };
  const by = c.profile.name || c.user.email;
  const paths = Array.isArray(photoPaths) ? photoPaths.filter(Boolean).slice(0, 8).map((p) => clean(p, 400)) : [];

  const row = { job_id: jobId || null, customer_name: clean(customerName, 160) || null, ref_type: t, note: n, urgent: !!urgent, photo_paths: paths, tech_name: by, tech_id: c.profile.tech_id || null, created_by: c.user.id };
  const { error } = await c.sb.from('sales_referrals').insert(row);
  if (error) return { ok: false, msg: missing(error) ? 'Run supabase/102_sales_referrals.sql first.' : error.message };

  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: by, role: c.profile.role, action: 'referral.submit', entity: 'sales_referral', entity_id: jobId ? String(jobId) : '', detail: { refType: t, urgent: !!urgent, photos: paths.length } }); } catch (_) {}
  // Ping the office (Captain Hook). No-ops gracefully if Discord isn't configured.
  try {
    const m = TYPE[t];
    await postToDiscord(`${m.icon} **${m.label} lead** from ${by}${row.customer_name ? ` · ${row.customer_name}` : ''}${urgent ? ' · 🚨 URGENT' : ''}\n> ${n.slice(0, 300)}${paths.length ? `\n📸 ${paths.length} photo${paths.length > 1 ? 's' : ''} attached` : ''}\nReview in Sales → Referrals.`, { to: 'office' });
  } catch (_) {}

  revalidatePath('/referrals');
  if (jobId) revalidatePath(`/job/${jobId}`);
  return { ok: true, msg: `Sent to Sales — ${TYPE[t].label} lead logged. They’ll scope it; the customer isn’t contacted by this.` };
}
