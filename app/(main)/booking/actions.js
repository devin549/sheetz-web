'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { revalidatePath } from 'next/cache';

async function assertBooker() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  if (!user || !can(profile.role, 'createJobs')) throw new Error('Your role can’t book jobs.');
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Server not configured.');
  return { sb, user, profile };
}
const clean = (v, n = 200) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);

// Type-ahead against the 13k customer base — name OR phone.
export async function searchCustomersForBooking(q) {
  let sb;
  try { ({ sb } = await assertBooker()); } catch { return []; }
  const term = clean(q, 60);
  if (term.length < 2) return [];
  const { data, error } = await sb.from('customers')
    .select('id, name, phone, address')
    .or(`name.ilike.%${term}%,phone.ilike.%${term}%`)
    .order('lifetime_revenue', { ascending: false, nullsFirst: false })
    .limit(8);
  if (error) return [];
  return (data || []).map((c) => ({ id: c.id, name: c.name || 'Customer', phone: c.phone || '', address: c.address || '' }));
}

// Create a booking: find-or-create the customer, then insert the job (status scheduled).
export async function createBooking(formData) {
  let ctx;
  try { ctx = await assertBooker(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const { sb } = ctx;

  let customerId = clean(formData.get('customerId'), 80) || null;
  const newName = clean(formData.get('newName'), 120);
  const newPhone = clean(formData.get('newPhone'), 40);
  const newAddress = clean(formData.get('newAddress'), 200);
  const jobType = clean(formData.get('jobType'), 120);
  const scheduledISO = clean(formData.get('scheduledISO'), 40);
  const durationMin = Math.max(15, Math.min(720, parseInt(formData.get('durationMin'), 10) || 60));
  const techId = clean(formData.get('techId'), 80) || null;
  const priority = ['normal', 'urgent', 'emergency'].includes(formData.get('priority')) ? formData.get('priority') : 'normal';
  const amount = Math.max(0, Number(formData.get('amount')) || 0);
  const address = clean(formData.get('address'), 200) || newAddress;

  if (!jobType) return { ok: false, msg: 'What’s the job? (service type)' };
  if (scheduledISO && Number.isNaN(Date.parse(scheduledISO))) return { ok: false, msg: 'Bad date/time.' };

  // create the customer if this is a new one
  if (!customerId) {
    if (!newName) return { ok: false, msg: 'Pick a customer or enter a new name.' };
    const { data: created, error: cErr } = await sb.from('customers')
      .insert({ name: newName, phone: newPhone || null, address: newAddress || null })
      .select('id').single();
    if (cErr) return { ok: false, msg: 'Customer: ' + cErr.message };
    customerId = created.id;
  }

  let techName = null;
  if (techId) { const { data: t } = await sb.from('techs').select('name').eq('id', techId).maybeSingle(); techName = (t && t.name) || null; }

  const patch = {
    customer_id: customerId, status: 'scheduled', job_type: jobType, priority,
    scheduled_at: scheduledISO || null, duration_min: durationMin, amount,
    tech_id: techId, tech_name: techName, assigned_at: techId ? new Date().toISOString() : null,
    address: address || null,
  };
  const { data: job, error: jErr } = await sb.from('jobs').insert(patch).select('id').single();
  if (jErr) return { ok: false, msg: 'Job: ' + jErr.message };

  try {
    await sb.from('audit_log').insert({ actor_id: ctx.user.id, actor_name: ctx.profile.name || ctx.user.email, role: ctx.profile.role, action: 'job.book', entity: 'job', entity_id: String(job.id), detail: { jobType } });
  } catch (_) {}

  revalidatePath('/board');
  revalidatePath('/job-records');
  return { ok: true, msg: 'Job booked.', jobId: job.id };
}
