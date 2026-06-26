'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { WASTE_REASONS } from '@/lib/helpers';

const REASONS = WASTE_REASONS.map((r) => r.reason);
const clean = (v, n = 300) => String(v == null ? '' : v).trim().slice(0, n);
const missing = (e) => /relation|column|schema cache|does not exist/i.test(e?.message || '');

async function ctx() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: 'Sign in required.' };
  return { user, profile: await loadProfile(user), sb: getSupabaseAdmin() };
}
async function log(sb, c, action, id, detail) {
  try { await sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: c.profile.name || c.user.email, role: c.profile.role, action, entity: 'helper_pairing', entity_id: String(id || ''), detail: detail || {} }); } catch (_) {}
}

// Helper tags the lead tech they're riding with. Saves GPS/device/window; status pending until the lead
// accepts OR the dispute window lapses (auto-active). One open pairing per helper at a time.
export async function pairWithTech(form) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  if (c.profile.role !== 'helper' && !can(c.profile.role, 'manageUsers')) return { ok: false, msg: 'Helpers tag their lead tech.' };
  const leadId = clean(form.get('lead_tech_id'), 60) || null;
  const leadName = clean(form.get('lead_tech_name'), 120);
  if (!leadName) return { ok: false, msg: 'Pick the tech you’re with.' };
  const lat = Number(form.get('lat')) || null, lng = Number(form.get('lng')) || null;
  const device = clean(form.get('device'), 120) || null;

  // close any still-open pairing for this helper first
  try { await c.sb.from('helper_pairings').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('helper_id', c.profile.tech_id).in('status', ['pending', 'active']); } catch (_) {}

  const { data, error } = await c.sb.from('helper_pairings').insert({
    helper_id: c.profile.tech_id, helper_name: c.profile.name || c.user.email,
    lead_tech_id: leadId, lead_tech_name: leadName, lat, lng, device, status: 'pending', started_at: new Date().toISOString(),
  }).select('id').maybeSingle();
  if (error) return { ok: false, msg: missing(error) ? 'Run supabase/87_job_segments.sql first.' : error.message };
  await log(c.sb, c, 'pairing.created', data?.id, { lead: leadName });
  revalidatePath('/helper');
  return { ok: true, msg: `Paired with ${leadName}. They’ll get an accept/dispute alert.` };
}

// Lead tech accepts or disputes the pairing. Only the named lead (or a manager) may act.
export async function respondPairing(id, accept, reason) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const { data: p } = await c.sb.from('helper_pairings').select('lead_tech_id, status').eq('id', id).maybeSingle();
  if (!p) return { ok: false, msg: 'Pairing not found.' };
  const isLead = p.lead_tech_id && p.lead_tech_id === c.profile.tech_id;
  if (!isLead && !can(c.profile.role, 'manageUsers') && !can(c.profile.role, 'seeCrew')) return { ok: false, msg: 'Only the lead tech can respond.' };
  const patch = accept
    ? { status: 'active', accepted_at: new Date().toISOString() }
    : { status: 'disputed', disputed_at: new Date().toISOString(), dispute_reason: clean(reason, 300) || 'Disputed' };
  const { error } = await c.sb.from('helper_pairings').update(patch).eq('id', id);
  if (error) return { ok: false, msg: error.message };
  await log(c.sb, c, accept ? 'pairing.accepted' : 'pairing.disputed', id, { reason: accept ? null : reason });
  revalidatePath('/helper'); revalidatePath('/my-day');
  return { ok: true };
}

// Helper taps an idle reason → opens a waste entry tied to the responsible (lead) tech. Helper STILL PAID.
export async function startWaste(reason, jobId) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  if (!REASONS.includes(reason)) return { ok: false, msg: 'Unknown reason.' };
  // find the helper's active/pending pairing for the responsible tech
  let pairing = null;
  try { const { data } = await c.sb.from('helper_pairings').select('id, lead_tech_id, lead_tech_name').eq('helper_id', c.profile.tech_id).in('status', ['active', 'pending']).order('started_at', { ascending: false }).limit(1).maybeSingle(); pairing = data; } catch (_) {}
  // close any open waste first (one running at a time)
  try { await c.sb.from('helper_waste').update({ ended_at: new Date().toISOString() }).eq('helper_id', c.profile.tech_id).is('ended_at', null); } catch (_) {}
  const { data, error } = await c.sb.from('helper_waste').insert({
    pairing_id: pairing?.id || null, helper_id: c.profile.tech_id, helper_name: c.profile.name || c.user.email,
    lead_tech_id: pairing?.lead_tech_id || null, lead_tech_name: pairing?.lead_tech_name || null,
    job_id: clean(jobId, 60) || null, reason, started_at: new Date().toISOString(),
  }).select('id').maybeSingle();
  if (error) return { ok: false, msg: missing(error) ? 'Run supabase/87_job_segments.sql first.' : error.message };
  await log(c.sb, c, 'waste.started', data?.id, { reason });
  revalidatePath('/helper');
  return { ok: true, id: data?.id };
}

// "Back to work" — close the open waste entry, stamping minutes.
export async function endWaste() {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const { data: open } = await c.sb.from('helper_waste').select('id, started_at').eq('helper_id', c.profile.tech_id).is('ended_at', null).order('started_at', { ascending: false }).limit(1).maybeSingle();
  if (!open) return { ok: true };
  const now = new Date();
  const minutes = open.started_at ? Math.max(0, Math.round((now - Date.parse(open.started_at)) / 60000)) : 0;
  await c.sb.from('helper_waste').update({ ended_at: now.toISOString(), minutes }).eq('id', open.id);
  await log(c.sb, c, 'waste.ended', open.id, { minutes });
  revalidatePath('/helper');
  return { ok: true, minutes };
}
