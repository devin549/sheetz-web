'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';

const VIEW = ['owner', 'admin', 'gm', 'om', 'csr', 'dispatcher', 'accounting', 'sales', 'marketing'];

async function gate() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  if (!user || !VIEW.includes(String(profile.role || '').toLowerCase())) return null;
  return getSupabaseAdmin();
}

// Search the customer base (search-first — 13k rows, never load all).
export async function searchAccounts(q) {
  const sb = await gate();
  if (!sb) return [];
  const term = String(q || '').trim().replace(/[%,]/g, ' ');
  if (term.length < 2) return [];
  const { data } = await sb.from('customers')
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

  return {
    customer,
    openBalance,
    invoiceCount: invoices.length,
    invoices: invoices.slice(0, 8),
    jobs: jobs || [],
    memberships,
  };
}
