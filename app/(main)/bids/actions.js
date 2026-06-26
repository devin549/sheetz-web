'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';

const clean = (v, n = 120) => String(v == null ? '' : v).trim().slice(0, n);
const missing = (e) => /relation|column|schema cache|does not exist/i.test(e?.message || '');

async function ctx() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!(can(profile.role, 'changeStatus') || can(profile.role, 'seeOwnOnly') || can(profile.role, 'seeCrew') || can(profile.role, 'seeAllJobs')))
    return { err: 'Not allowed.' };
  return { user, profile, sb: getSupabaseAdmin() };
}

// Log a follow-up contact on a bid → it stays YOURS (Sales can't take it) and the 24h escalation clock stops.
export async function contactBid(jobId, method) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const m = ['text', 'call', 'email'].includes(method) ? method : 'call';
  const by = c.profile.name || c.user.email;
  const { error } = await c.sb.from('jobs').update({ bid_contacted_at: new Date().toISOString(), bid_contacted_by: by, bid_contact_method: m }).eq('id', jobId);
  if (error) return { ok: false, msg: missing(error) ? 'Run supabase/100_bid_contact.sql first.' : error.message };
  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: by, role: c.profile.role, action: 'bid.contact', entity: 'job', entity_id: String(jobId), detail: { method: m } }); } catch (_) {}
  revalidatePath('/bids');
  const verb = m === 'text' ? 'Texted' : m === 'call' ? 'Called' : 'Emailed';
  return { ok: true, msg: `${verb} — logged. This bid stays yours; mark it Won when they book.` };
}

// Schedule (or clear) a follow-up date on a bid.
export async function scheduleFollowup(jobId, dateStr) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const d = clean(dateStr, 12) || null;
  const { error } = await c.sb.from('jobs').update({ bid_followup_at: d }).eq('id', jobId);
  if (error) return { ok: false, msg: missing(error) ? 'Run supabase/100_bid_contact.sql first.' : error.message };
  revalidatePath('/bids');
  return { ok: true, msg: d ? `Follow-up set for ${d}.` : 'Follow-up cleared.' };
}
