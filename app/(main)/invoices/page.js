import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import InvoicesList from './InvoicesList';

export const dynamic = 'force-dynamic';

const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

export default async function Invoices() {
  await requirePerm('seeFinancials', 'seeReports');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Invoices</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();

  const { count } = await sb.from('invoices').select('id', { count: 'exact', head: true });
  const { data, error } = await sb.from('invoices')
    .select('id, invoice_number, invoice_date, status, total, balance, customer_id')
    .order('invoice_date', { ascending: false, nullsFirst: false })
    .limit(300);

  // invoices ↔ customers has no FK relationship, so resolve names with a second query.
  const ids = [...new Set((data || []).map((i) => i.customer_id).filter(Boolean))];
  const nameById = {};
  if (ids.length) { const { data: cs } = await sb.from('customers').select('id, name').in('id', ids); (cs || []).forEach((c) => { nameById[c.id] = c.name; }); }

  const rows = (data || []).map((i) => ({
    id: i.id, number: i.invoice_number || '', date: i.invoice_date || '', status: String(i.status || 'open').toLowerCase(),
    total: Number(i.total) || 0, balance: Number(i.balance) || 0, customer: nameById[i.customer_id] || 'Customer',
  }));
  const openBalance = rows.filter((r) => r.balance > 0).reduce((s, r) => s + r.balance, 0);

  return (
    <div className="wrap" style={{ maxWidth: 1000 }}>
      <div className="h1">Invoices</div>
      <p className="muted">
        {count != null ? count.toLocaleString() : rows.length} invoices in the book · showing the latest {rows.length}.
        Open balance in view: <strong style={{ color: 'var(--red)' }}>{money(openBalance)}</strong>. Full AR aging → <a href="/past-due">Past Due</a>.
      </p>
      {error ? <div className="notice">Couldn’t load invoices: {error.message}</div> : <InvoicesList rows={rows} />}
    </div>
  );
}
