'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { revalidatePath } from 'next/cache';

async function assertIntake() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  if (!user || !(can(profile.role, 'createJobs') || can(profile.role, 'contactCustomer'))) throw new Error('Not allowed.');
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Server not configured.');
  return { sb, user, profile };
}
const clean = (v, n = 200) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);

export async function setLeadStatus(id, status) {
  let ctx; try { ctx = await assertIntake(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  if (!['new', 'contacted', 'dead'].includes(status)) return { ok: false, msg: 'Bad status.' };
  const { error } = await ctx.sb.from('web_leads').update({ status, updated_at: new Date().toISOString() }).eq('id', clean(id, 80));
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/web-leads');
  return { ok: true };
}

// Convert a lead into a job (find-or-create the customer; lands in the board tray to schedule).
export async function bookLead(id) {
  let ctx; try { ctx = await assertIntake(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  if (!can(ctx.profile.role, 'createJobs')) return { ok: false, msg: 'Your role can’t book jobs.' };
  const lid = clean(id, 80);
  const { data: lead } = await ctx.sb.from('web_leads').select('id, name, phone, email, address, service, customer_id, job_id').eq('id', lid).maybeSingle();
  if (!lead) return { ok: false, msg: 'Lead not found.' };
  if (lead.job_id) return { ok: false, msg: 'Already booked.' };

  let customerId = lead.customer_id || null;
  if (!customerId && lead.phone) { const { data: m } = await ctx.sb.from('customers').select('id').eq('phone', lead.phone).limit(1); if (m && m[0]) customerId = m[0].id; }
  if (!customerId) {
    const { data: created, error: cErr } = await ctx.sb.from('customers')
      .insert({ name: lead.name || 'Web Lead', phone: lead.phone || null, email: lead.email || null, address: lead.address || null })
      .select('id').single();
    if (cErr) return { ok: false, msg: 'Customer: ' + cErr.message };
    customerId = created.id;
  }
  const { data: job, error: jErr } = await ctx.sb.from('jobs')
    .insert({ customer_id: customerId, status: 'scheduled', job_type: lead.service || 'Service call', address: lead.address || null })
    .select('id').single();
  if (jErr) return { ok: false, msg: 'Job: ' + jErr.message };

  await ctx.sb.from('web_leads').update({ status: 'booked', customer_id: customerId, job_id: job.id, updated_at: new Date().toISOString() }).eq('id', lid);
  revalidatePath('/web-leads');
  revalidatePath('/board');
  return { ok: true, msg: 'Booked → on the board tray.', jobId: job.id };
}
