'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { revalidatePath } from 'next/cache';

const MANAGE = ['owner', 'admin', 'gm', 'om', 'csr', 'dispatcher', 'marketing', 'sales'];

async function gate() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  if (!user || !MANAGE.includes(String(profile.role || '').toLowerCase())) return { ok: false, msg: 'Your role can’t log reviews.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  return { ok: true, sb, who: profile.name || user.email };
}
const missing = (e) => /could not find|does not exist|schema cache/i.test(e?.message || '');

// Any signed-in user (incl. a tech) for the tech-side reviews pane.
async function anyUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  return { ok: true, sb, user, profile, who: profile.name || user.email };
}

// A TECH disputes an unfair low review (Karen / not CB's fault). Flags it pending for a manager; can only
// dispute reviews tied to their OWN name. Notifies the office via the P4 alert brain.
export async function disputeReview(id, reason) {
  const g = await anyUser(); if (!g.ok) return g;
  const r = String(reason || '').trim().slice(0, 500);
  if (!r) return { ok: false, msg: 'Add a quick reason (Karen / not our fault / wrong tech…).' };
  const { data: rev } = await g.sb.from('reviews').select('tech_name, rating, customer_name').eq('id', id).maybeSingle();
  if (!rev) return { ok: false, msg: 'Review not found.' };
  const mine = String(rev.tech_name || '').trim().toLowerCase() === String(g.who).trim().toLowerCase();
  const isMgr = MANAGE.includes(String(g.profile.role || '').toLowerCase());
  if (!mine && !isMgr) return { ok: false, msg: 'You can only dispute your own reviews.' };
  let { error } = await g.sb.from('reviews').update({ disputed: true, dispute_status: 'pending', dispute_reason: r, disputed_at: new Date().toISOString(), dispute_by: g.who }).eq('id', id);
  if (error) return { ok: false, msg: missing(error) ? 'Run supabase/90_review_dispute.sql first.' : error.message };
  try { const { createAlert } = await import('@/lib/alerts'); await createAlert(g.sb, { kind: 'photo_qa', entity: 'review', entityId: String(id), title: `Review dispute: ${g.who} (${rev.rating}★)`, body: `${g.who} disputes a ${rev.rating}★ from ${rev.customer_name || 'a customer'}: “${r}”. Approve → wipes it from the Review Race; deny → it stands.`, severity: 'med', dedupeKey: `review-dispute:${id}` }); } catch (_) {}
  revalidatePath('/reviews');
  return { ok: true, msg: 'Sent to a manager — they decide within 48 hrs.' };
}

// Manager resolves a dispute. Approved wipes it from the race (we mark responded so it drops out of counts).
export async function resolveDispute(id, approve) {
  const g = await gate(); if (!g.ok) return g;
  const patch = approve
    ? { dispute_status: 'approved', responded: true, decided_by: g.who, decided_at: new Date().toISOString() }
    : { dispute_status: 'denied', decided_by: g.who, decided_at: new Date().toISOString() };
  const { error } = await g.sb.from('reviews').update(patch).eq('id', id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/reviews');
  return { ok: true };
}

export async function createReview(formData) {
  const g = await gate();
  if (!g.ok) return g;

  const customer_name = String(formData.get('customer_name') || '').trim().slice(0, 160) || null;
  const rating = Math.max(1, Math.min(5, Math.round(Number(formData.get('rating')) || 5)));
  const source = String(formData.get('source') || 'Google').slice(0, 40);
  const tech_name = String(formData.get('tech_name') || '').trim().slice(0, 120) || null;
  const text = String(formData.get('text') || '').trim().slice(0, 2000) || null;
  const customer_id = String(formData.get('customerId') || '').trim() || null;
  const tech_id = String(formData.get('techId') || '').trim() || null;

  const base = { customer_name, rating, source, tech_name, text, created_by: g.who };
  let ins = await g.sb.from('reviews').insert({ ...base, customer_id, tech_id }).select('id').single();
  if (ins.error && /column|schema cache/i.test(ins.error.message || '')) ins = await g.sb.from('reviews').insert(base).select('id').single(); // pre-51
  if (ins.error) return { ok: false, msg: missing(ins.error) ? 'Run supabase/37_reviews.sql first.' : ins.error.message };
  revalidatePath('/reviews');
  revalidatePath('/board');
  return { ok: true, msg: `Logged ${rating}★ review.` };
}

// Assign who owns the recovery on a low review.
export async function assignRecovery(formData) {
  const g = await gate();
  if (!g.ok) return g;
  const id = String(formData.get('id') || '');
  const owner = String(formData.get('owner') || '').trim().slice(0, 80) || null;
  if (!id) return { ok: false, msg: 'No review.' };
  const { error } = await g.sb.from('reviews').update({ recovery_owner: owner }).eq('id', id);
  if (error) return { ok: false, msg: /column|schema cache/i.test(error.message || '') ? 'Run supabase/51_reviews_links.sql first.' : error.message };
  revalidatePath('/reviews');
  return { ok: true, msg: owner ? `Recovery owner: ${owner}.` : 'Owner cleared.' };
}

// Typeahead to link a review to a customer record (phone-tolerant via the search RPC).
export async function searchReviewCustomers(q) {
  const g = await gate();
  if (!g.ok) return [];
  const term = String(q || '').trim();
  if (term.length < 2) return [];
  const rpc = await g.sb.rpc('search_customers', { term });
  if (rpc.error) return [];
  return (rpc.data || []).slice(0, 8).map((c) => ({ id: c.id, name: c.name || 'Customer', phone: c.phone || '' }));
}

export async function markResponded(id) {
  const g = await gate();
  if (!g.ok) return g;
  const { error } = await g.sb.from('reviews').update({ responded: true, responded_by: g.who, responded_at: new Date().toISOString() }).eq('id', id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/reviews');
  return { ok: true, msg: 'Marked handled.' };
}
