'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { canAny } from '@/lib/roles';
import { findLocalBusinesses } from '@/lib/serpLeads';

const clean = (v, n = 300) => String(v == null ? '' : v).trim().slice(0, n);
const missing = (e) => /relation|column|schema cache|does not exist/i.test(e?.message || '');
const isOffice = (r) => canAny(r, ['seeReports', 'assignJobs', 'manageUsers', 'seeFinancials', 'seeCrew']);

async function ctx() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!isOffice(profile.role)) return { err: 'Office / sales only.' };
  return { user, profile, sb: getSupabaseAdmin() };
}

// 🔎 Live SerpAPI search for prospects (not saved yet — returned for review). category + town.
export async function searchLeads(category, location) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err, results: [] };
  const cat = clean(category, 80), loc = clean(location, 80);
  if (!cat || !loc) return { ok: false, msg: 'Pick a type and a town.', results: [] };
  const r = await findLocalBusinesses(cat, loc);
  if (!r.ok) return r;
  // Flag which are already in the pipeline.
  let existing = new Set();
  try { const { data } = await c.sb.from('leads').select('name'); existing = new Set((data || []).map((d) => (d.name || '').toLowerCase())); } catch (_) {}
  const results = r.results.map((x) => ({ ...x, category: cat, location, saved: existing.has((x.name || '').toLowerCase()) }));
  return { ok: true, results };
}

// 💾 Save selected prospects into the pipeline (dedupe on name+address).
export async function saveLeads(leads) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  if (!Array.isArray(leads) || !leads.length) return { ok: false, msg: 'Nothing selected.' };
  const rows = leads.slice(0, 60).map((l) => ({
    name: clean(l.name, 200), category: clean(l.category, 80) || null, address: clean(l.address, 300) || null,
    phone: clean(l.phone, 40) || null, website: clean(l.website, 300) || null,
    rating: l.rating || null, reviews: l.reviews || null, place_id: clean(l.placeId, 120) || null,
    location_searched: clean(l.location, 80) || null, created_by: c.user.id, created_by_name: c.profile.name || c.user.email,
  })).filter((r) => r.name);
  const { error } = await c.sb.from('leads').upsert(rows, { onConflict: 'name,address', ignoreDuplicates: true });
  if (error) {
    // The dedupe index is an expression index; if upsert onConflict can't target it, fall back to plain insert ignoring dupes.
    if (/no unique|on conflict|constraint/i.test(error.message || '')) {
      for (const row of rows) { try { await c.sb.from('leads').insert(row); } catch (_) {} }
    } else return { ok: false, msg: missing(error) ? 'Run supabase/108_leads.sql first.' : error.message };
  }
  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: c.profile.name || c.user.email, role: c.profile.role, action: 'leads.save', entity: 'leads', entity_id: '', detail: { count: rows.length } }); } catch (_) {}
  revalidatePath('/leads');
  return { ok: true, msg: `Saved ${rows.length} to the pipeline.` };
}

export async function setLeadStatus(id, status, notes) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  if (!['new', 'contacted', 'qualified', 'won', 'dead'].includes(status)) return { ok: false, msg: 'Bad status.' };
  const patch = { status }; const n = clean(notes, 400); if (n) patch.notes = n;
  if (status !== 'new') patch.claimed_by = c.profile.name || c.user.email;
  const { error } = await c.sb.from('leads').update(patch).eq('id', id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/leads');
  return { ok: true, msg: `Marked ${status}.` };
}
