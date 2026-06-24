'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { revalidatePath } from 'next/cache';

const VIEW = ['owner', 'admin', 'gm', 'om', 'csr', 'dispatcher', 'accounting', 'sales', 'marketing'];
const clean = (v, n = 400) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);

async function gate() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  if (!user || !VIEW.includes(String(profile.role || '').toLowerCase())) return null;
  return getSupabaseAdmin();
}
// who is acting (for created_by / owner defaults)
async function actor() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await loadProfile(user) : null;
  return profile ? (profile.name || (user && user.email) || '') : '';
}

// Search the customer base (search-first — 13k rows, never load all).
export async function searchAccounts(q) {
  const sb = await gate();
  if (!sb) return [];
  const term = String(q || '').trim().replace(/[%,]/g, ' ');
  if (term.length < 2) return [];
  // RPC matches phones regardless of formatting (digits find "(859) 779-8824").
  const rpc = await sb.rpc('search_customers', { term });
  if (!rpc.error) return rpc.data || [];
  const { data } = await sb.from('customers') // pre-42 fallback
    .select('id, name, phone, cb_number, lifetime_revenue, lifetime_jobs, last_job_completed, do_not_service')
    .or(`name.ilike.%${term}%,phone.ilike.%${term}%`)
    .order('lifetime_revenue', { ascending: false, nullsFirst: false })
    .limit(25);
  return data || [];
}

// Full account standing for one customer.
export async function loadAccount(id) {
  const sb = await gate();
  if (!sb || !id) return null;

  const { data: customer } = await sb.from('customers').select('*').eq('id', id).maybeSingle();
  if (!customer) return null;

  // invoices for this customer → open balance + recent
  const { data: inv } = await sb.from('invoices')
    .select('invoice_number, invoice_date, total, balance, status')
    .eq('customer_id', id).order('invoice_date', { ascending: false }).limit(200);
  const invoices = inv || [];
  const openBalance = invoices.reduce((s, i) => (i.status === 'open' ? s + (Number(i.balance) || 0) : s), 0);

  // recent jobs
  const { data: jobs } = await sb.from('jobs')
    .select('id, job_number, job_type, status, scheduled_at, completed_at, amount, tech_name, city')
    .eq('customer_id', id).order('scheduled_at', { ascending: false }).limit(10);

  // memberships — match by customer_id or name (customer_id is often unset). Graceful if no table.
  let memberships = [];
  try {
    const { data: mem, error } = await sb.from('memberships').select('plan, status, price_cents, period, customer_id, customer');
    if (!error && mem) {
      const nm = String(customer.name || '').toLowerCase();
      memberships = mem.filter((m) => m.customer_id === id || String(m.customer || '').toLowerCase() === nm)
        .map((m) => ({ plan: m.plan, status: m.status, price_cents: m.price_cents, period: m.period }));
    }
  } catch (_) { memberships = []; }

  // CRM timeline — logged interactions + follow-ups (graceful if table absent)
  let interactions = [];
  try {
    const { data: ix } = await sb.from('customer_interactions')
      .select('id, kind, summary, due_date, status, owner, created_by, created_at')
      .eq('customer_id', id).order('created_at', { ascending: false }).limit(50);
    interactions = ix || [];
  } catch (_) { interactions = []; }

  return {
    customer,
    openBalance,
    invoiceCount: invoices.length,
    invoices: invoices.slice(0, 8),
    jobs: jobs || [],
    memberships,
    interactions,
  };
}

// Log a customer interaction. A due_date makes it an OPEN follow-up; otherwise it's a logged touch.
export async function logInteraction(formData) {
  const sb = await gate();
  if (!sb) return { ok: false, msg: 'Your role can’t log interactions.' };
  const customer_id = clean(formData.get('customerId'), 80) || null;
  const customer_name = clean(formData.get('customerName'), 160) || null;
  const summary = clean(formData.get('summary'), 600);
  if (!customer_id || !summary) return { ok: false, msg: 'Pick a customer and write a summary.' };
  const kind = clean(formData.get('kind'), 30) || 'note';
  const due_date = clean(formData.get('dueDate'), 10) || null;
  const owner = clean(formData.get('owner'), 80) || null;
  const me = await actor();
  const { error } = await sb.from('customer_interactions').insert({
    customer_id, customer_name, kind, summary, due_date,
    status: due_date ? 'open' : 'done', owner: owner || (due_date ? me : null), created_by: me,
  });
  if (error) return { ok: false, msg: /schema cache|does not exist|could not find/i.test(error.message || '') ? 'Run supabase/54_customer_interactions.sql first.' : error.message };
  revalidatePath('/accounts');
  return { ok: true, msg: due_date ? 'Follow-up set.' : 'Logged.' };
}

export async function completeFollowup(id) {
  const sb = await gate();
  if (!sb) return { ok: false, msg: 'Not allowed.' };
  const { error } = await sb.from('customer_interactions').update({ status: 'done', done_at: new Date().toISOString() }).eq('id', id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/accounts');
  return { ok: true, msg: 'Done.' };
}
