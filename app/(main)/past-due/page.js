import Link from 'next/link';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import { can } from '@/lib/roles';
import PastDueList from './PastDueList';

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

  // pull every open invoice (small table) and group by customer
  const byCust = {}; // customer_id -> { total, invoices:[], oldest: ms }
  let total = 0, count = 0, from = 0;
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
      if (i.invoice_date) { const t = new Date(i.invoice_date).getTime(); if (!Number.isNaN(t) && (g.oldest == null || t < g.oldest)) g.oldest = t; }
    });
    if (data.length < 1000) break;
    from += 1000;
  }

  const ranked = Object.entries(byCust).map(([cid, g]) => ({ cid, ...g })).sort((a, b) => b.total - a.total);
  const custCount = ranked.length;
  const top = ranked.slice(0, 100);

  const ids = top.map((r) => r.cid).filter((id) => id && id !== '__none__');
  const cmap = {};
  if (ids.length) {
    const { data: custs } = await sb.from('customers').select('id, name, cb_number, phone').in('id', ids);
    (custs || []).forEach((c) => { cmap[c.id] = c; });
  }

  // serializable payload for the client list
  const customers = top.map((r) => {
    const c = cmap[r.cid] || {};
    const invoices = r.invoices.slice().sort((a, b) => new Date(a.invoice_date || 0) - new Date(b.invoice_date || 0))
      .map((i) => ({ id: i.id, invoice_number: i.invoice_number, invoice_date: i.invoice_date, balance: Number(i.balance) || 0, city: i.city || '', days: daysSince(i.invoice_date ? new Date(i.invoice_date).getTime() : null) }));
    return { cid: r.cid, name: c.name || 'Unknown customer', cbNumber: c.cb_number || null, phone: c.phone || '', total: Math.round(r.total), invoices, oldestDays: daysSince(r.oldest) };
  });

  return (
    <div className="wrap" style={{ maxWidth: 1180 }}>
      <div className="h1">💰 Past Due <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>· by customer</span></div>

      <div className="card card-amber" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div><div style={{ fontSize: 26, fontWeight: 800, color: 'var(--accent)' }}>{money(total)}</div><div className="muted" style={{ fontSize: 11 }}>total outstanding</div></div>
        <div><div style={{ fontSize: 26, fontWeight: 800 }}>{custCount.toLocaleString()}</div><div className="muted" style={{ fontSize: 11 }}>customers owing</div></div>
        <div><div style={{ fontSize: 26, fontWeight: 800 }}>{count.toLocaleString()}</div><div className="muted" style={{ fontSize: 11 }}>open invoices</div></div>
        <div className="muted" style={{ fontSize: 12, flex: 1, minWidth: 180 }}>
          Top 100 owers, biggest first. Tap a customer to expand{canMark ? ' + mark paid' : ''}. <Link href="/customers">search a customer →</Link>
        </div>
      </div>

      <PastDueList customers={customers} canMark={canMark} />
    </div>
  );
}
