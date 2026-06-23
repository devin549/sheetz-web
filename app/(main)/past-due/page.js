import Link from 'next/link';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import { can } from '@/lib/roles';
import PastDueList from './PastDueList';
import AccountingBot from './AccountingBot';

export const dynamic = 'force-dynamic';

function money(n) { return '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }); }
const daysSince = (ms) => (ms ? Math.floor((Date.now() - ms) / 86400000) : null);

export default async function PastDue() {
  const { role } = await requireHref('/past-due');
  const canMark = can(role, 'seeFinancials') && role !== 'viewer';

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">💰 Past Due</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel to read invoices, then this fills in.</div></div>;
  }
  const sb = getSupabaseAdmin();

  // every open invoice → group by customer + roll up an A/R aging summary
  const byCust = {};
  const aging = { cur: 0, d60: 0, d90: 0, d90p: 0 }; // 0-30 / 31-60 / 61-90 / 90+
  let total = 0, count = 0, from = 0;
  const now = Date.now();
  while (true) {
    const { data } = await sb.from('invoices')
      .select('id, invoice_number, invoice_date, balance, customer_id, city')
      .eq('status', 'open').range(from, from + 999);
    if (!data || !data.length) break;
    data.forEach((i) => {
      const cid = i.customer_id || '__none__';
      const g = byCust[cid] = byCust[cid] || { total: 0, invoices: [], oldest: null };
      const bal = Number(i.balance) || 0;
      g.total += bal; total += bal; count++;
      g.invoices.push(i);
      let t = null;
      if (i.invoice_date) { t = new Date(i.invoice_date).getTime(); if (!Number.isNaN(t) && (g.oldest == null || t < g.oldest)) g.oldest = t; }
      const d = t ? (now - t) / 86400000 : 0;
      if (d > 90) aging.d90p += bal; else if (d > 60) aging.d90 += bal; else if (d > 30) aging.d60 += bal; else aging.cur += bal;
    });
    if (data.length < 1000) break;
    from += 1000;
  }

  const ranked = Object.entries(byCust).map(([cid, g]) => ({ cid, ...g })).sort((a, b) => b.total - a.total);
  const custCount = ranked.length;

  // names for EVERY owing customer (so search covers them all)
  const ids = ranked.map((r) => r.cid).filter((id) => id && id !== '__none__');
  const cmap = {};
  for (let i = 0; i < ids.length; i += 300) {
    const { data: custs } = await sb.from('customers').select('id, name, cb_number, phone, email, address').in('id', ids.slice(i, i + 300));
    (custs || []).forEach((c) => { cmap[c.id] = c; });
  }

  // Ashley's per-customer A/R notes (table may not exist before migration 19 — skip safely)
  const noteMap = {};
  try {
    for (let i = 0; i < ids.length; i += 300) {
      const { data: notes } = await sb.from('ar_notes').select('customer_id, note').in('customer_id', ids.slice(i, i + 300));
      (notes || []).forEach((n) => { if (n.note) noteMap[n.customer_id] = n.note; });
    }
  } catch (_) {}

  const customers = ranked.map((r) => {
    const c = cmap[r.cid] || {};
    const invoices = r.invoices.slice().sort((a, b) => new Date(a.invoice_date || 0) - new Date(b.invoice_date || 0))
      .map((i) => ({ id: i.id, invoice_number: i.invoice_number, invoice_date: i.invoice_date, balance: Number(i.balance) || 0, city: i.city || '', days: daysSince(i.invoice_date ? new Date(i.invoice_date).getTime() : null) }));
    // per-customer aging split (QuickBooks columns)
    const cb = { cur: 0, d60: 0, d90: 0, d90p: 0 };
    invoices.forEach((i) => { const d = i.days || 0; if (d > 90) cb.d90p += i.balance; else if (d > 60) cb.d90 += i.balance; else if (d > 30) cb.d60 += i.balance; else cb.cur += i.balance; });
    return { cid: r.cid, name: c.name || 'Unknown customer', cbNumber: c.cb_number || null, phone: c.phone || '', email: c.email || '', address: c.address || '', note: noteMap[r.cid] || '', total: Math.round(r.total), invoices, oldestDays: daysSince(r.oldest), buckets: cb };
  });

  // recent collections ledger for the books bot (best-effort — table may not exist yet)
  let recent = [];
  if (can(role, 'seeFinancials')) {
    const { data } = await sb.from('ar_activity').select('id, action, customer_name, invoice_number, amount, by_email, created_at').order('created_at', { ascending: false }).limit(6);
    recent = data || [];
  }

  const summary = { total: Math.round(total), count, custCount, aging: { cur: Math.round(aging.cur), d60: Math.round(aging.d60), d90: Math.round(aging.d90), d90p: Math.round(aging.d90p) } };

  return (
    <div className="wrap" style={{ maxWidth: 1180 }}>
      {/* tight header — the numbers live in the clickable summary below */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div className="h1" style={{ marginBottom: 2 }}>💰 Accounts Receivable</div>
        <div className="muted" style={{ fontSize: 12, display: 'flex', gap: 14 }}>
          <Link href="/past-due/report" target="_blank">📄 AR aging report</Link>
          <Link href="/customers">customer lookup →</Link>
        </div>
      </div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>{money(total)} open · {count.toLocaleString()} invoices · {custCount.toLocaleString()} customers</div>

      {/* AR data first: clickable aging filter + top deadbeats + the list */}
      <PastDueList customers={customers} canMark={canMark} summary={summary} />

      {/* Books Bot + recent collections moved below so the AR data leads */}
      {can(role, 'seeFinancials') && <div style={{ marginTop: 16 }}><AccountingBot recent={recent} /></div>}
    </div>
  );
}
