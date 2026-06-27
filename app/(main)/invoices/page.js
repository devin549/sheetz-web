import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref, requirePerm } from '@/lib/guard';
import { can } from '@/lib/roles';
import { canSee } from '@/lib/nav';
import { redirect } from 'next/navigation';
import InvoicesList from './InvoicesList';

export const dynamic = 'force-dynamic';

const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

// Can this viewer see THIS customer's invoices? Office/AR roles (who can see the whole book): any customer.
// Field roles: ONLY if they actually have a job for this customer (own jobs when own-only) — so a tech sees
// the invoices for customers they're working, but can't enumerate the rest of the book.
async function canViewCustomerInvoices(sb, role, profile, customerId) {
  if (canSee('/invoices', role)) return true; // owner/admin/gm/dispatcher/csr/om/accounting/sales
  const ownOnly = !can(role, 'seeAllJobs') && can(role, 'seeOwnOnly');
  if (ownOnly && !profile.tech_id) return false;
  let q = sb.from('jobs').select('id').eq('customer_id', customerId).limit(1);
  if (ownOnly) q = q.eq('tech_id', profile.tech_id);
  const { data } = await q;
  return (data || []).length > 0;
}

export default async function Invoices({ searchParams }) {
  const customerId = searchParams?.customer ? String(searchParams.customer) : null;

  // The UNSCOPED full book stays office/AR-only (existing nav gate). A customer-SCOPED view is allowed for
  // anyone who actually works that customer (verified below) — so a tech can see one customer's invoices.
  const { role, profile } = customerId ? await requirePerm() : await requireHref('/invoices');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Invoices</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();

  if (customerId && !(await canViewCustomerInvoices(sb, role, profile, customerId))) redirect('/');

  let q = sb.from('invoices')
    .select('id, invoice_number, invoice_date, status, total, balance, customer_id')
    .order('invoice_date', { ascending: false, nullsFirst: false });
  q = customerId ? q.eq('customer_id', customerId) : q.limit(300);
  const { data, error } = await q;

  // Total count only matters for the full-book header.
  let countAll = null;
  if (!customerId) { const { count } = await sb.from('invoices').select('id', { count: 'exact', head: true }); countAll = count; }

  // invoices ↔ customers has no FK relationship, so resolve names with a second query.
  const ids = [...new Set((data || []).map((i) => i.customer_id).filter(Boolean))];
  const nameById = {};
  if (ids.length) { const { data: cs } = await sb.from('customers').select('id, name').in('id', ids); (cs || []).forEach((c) => { nameById[c.id] = c.name; }); }

  const rows = (data || []).map((i) => ({
    id: i.id, number: i.invoice_number || '', date: i.invoice_date || '', status: String(i.status || 'open').toLowerCase(),
    total: Number(i.total) || 0, balance: Number(i.balance) || 0, customer: nameById[i.customer_id] || 'Customer',
  }));
  const openBalance = rows.filter((r) => r.balance > 0).reduce((s, r) => s + r.balance, 0);
  const custName = customerId ? (nameById[customerId] || 'this customer') : null;

  return (
    <div className="wrap" style={{ maxWidth: 1000 }}>
      <div className="h1">{custName ? `${custName} · Invoices` : 'Invoices'}</div>
      <p className="muted">
        {custName ? (
          <>Showing all {rows.length} invoice{rows.length === 1 ? '' : 's'} for {custName}. Open balance: <strong style={{ color: 'var(--red)' }}>{money(openBalance)}</strong>.</>
        ) : (
          <>{countAll != null ? countAll.toLocaleString() : rows.length} invoices in the book · showing the latest {rows.length}.
          Open balance in view: <strong style={{ color: 'var(--red)' }}>{money(openBalance)}</strong>. Full AR aging → <a href="/past-due">Past Due</a>.</>
        )}
      </p>
      {error ? <div className="notice">Couldn’t load invoices: {error.message}</div> : <InvoicesList rows={rows} />}
    </div>
  );
}
