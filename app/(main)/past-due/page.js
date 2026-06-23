import Link from 'next/link';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';

export const dynamic = 'force-dynamic';

function money(n) { return '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }); }
function daysSince(dateStr) {
  if (!dateStr) return null;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}
function ageColor(days) {
  if (days == null) return 'var(--fg-3)';
  if (days > 90) return 'var(--red)';
  if (days > 60) return '#e65100';
  if (days > 30) return '#e0a800';
  return 'var(--fg-3)';
}

export default async function PastDue() {
  await requireHref('/past-due');
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

  // rank customers by what they owe, take the top 100
  const ranked = Object.entries(byCust)
    .map(([cid, g]) => ({ cid, ...g }))
    .sort((a, b) => b.total - a.total);
  const custCount = ranked.length;
  const top = ranked.slice(0, 100);

  // names for the shown customers
  const ids = top.map((r) => r.cid).filter((id) => id && id !== '__none__');
  const cmap = {};
  if (ids.length) {
    const { data: custs } = await sb.from('customers').select('id, name, cb_number, phone').in('id', ids);
    (custs || []).forEach((c) => { cmap[c.id] = c; });
  }

  return (
    <div className="wrap">
      <div className="h1">💰 Past Due <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>· by customer</span></div>

      <div className="card card-amber" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div><div style={{ fontSize: 26, fontWeight: 800, color: 'var(--accent)' }}>{money(total)}</div><div className="muted" style={{ fontSize: 11 }}>total outstanding</div></div>
        <div><div style={{ fontSize: 26, fontWeight: 800 }}>{custCount.toLocaleString()}</div><div className="muted" style={{ fontSize: 11 }}>customers owing</div></div>
        <div><div style={{ fontSize: 26, fontWeight: 800 }}>{count.toLocaleString()}</div><div className="muted" style={{ fontSize: 11 }}>open invoices</div></div>
        <div className="muted" style={{ fontSize: 12, flex: 1, minWidth: 180 }}>Top 100 owers, biggest first. <Link href="/customers">search a customer →</Link></div>
      </div>

      {top.map((r) => {
        const c = cmap[r.cid] || {};
        const oldestDays = r.oldest ? Math.floor((Date.now() - r.oldest) / 86400000) : null;
        const invs = r.invoices.slice().sort((a, b) => new Date(a.invoice_date || 0) - new Date(b.invoice_date || 0));
        return (
          <div key={r.cid} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <span style={{ fontWeight: 800, fontSize: 15 }}>{c.name || 'Unknown customer'}</span>
                {c.cb_number && <span className="pill" style={{ marginLeft: 8, color: 'var(--accent)' }}>CB-{c.cb_number}</span>}
                {c.phone && <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>📞 {c.phone}</span>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--accent)' }}>{money(r.total)}</span>
                <div style={{ fontSize: 11, color: ageColor(oldestDays), fontWeight: 700 }}>
                  {r.invoices.length} invoice{r.invoices.length > 1 ? 's' : ''}{oldestDays != null ? ` · oldest ${oldestDays} days late` : ''}
                </div>
              </div>
            </div>

            {/* all of this customer's past-due invoices, together */}
            <div style={{ marginTop: 8, borderTop: '1px solid var(--border)' }}>
              {invs.map((i) => {
                const d = daysSince(i.invoice_date);
                return (
                  <div key={i.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)', alignItems: 'center', fontSize: 13 }}>
                    <span>#{i.invoice_number}{i.city ? <span className="muted" style={{ fontSize: 11 }}> · {i.city}</span> : ''}</span>
                    <span style={{ color: ageColor(d), fontSize: 12, whiteSpace: 'nowrap' }}>{i.invoice_date || '—'}{d != null ? ` · ${d}d` : ''}</span>
                    <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{money(i.balance)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
