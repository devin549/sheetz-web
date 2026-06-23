import Link from 'next/link';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';

export const dynamic = 'force-dynamic';

function money(n) {
  return '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function ageColor(dateStr) {
  if (!dateStr) return 'var(--fg-3)';
  const days = (Date.now() - new Date(dateStr).getTime()) / 86400000;
  if (days > 90) return 'var(--red)';
  if (days > 30) return '#e65100';
  return 'var(--fg-3)';
}

export default async function PastDue() {
  await requireHref('/past-due');
  if (!isAdminConfigured) {
    return (
      <div className="wrap">
        <div className="h1">💰 Past Due</div>
        <div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel to read invoices, then this fills in.</div>
      </div>
    );
  }
  const sb = getSupabaseAdmin();

  // total outstanding + count (paginate the balances — small table)
  let total = 0, count = 0, from = 0;
  while (true) {
    const { data } = await sb.from('invoices').select('balance').eq('status', 'open').range(from, from + 999);
    if (!data || !data.length) break;
    data.forEach((d) => { total += Number(d.balance) || 0; });
    count += data.length;
    if (data.length < 1000) break;
    from += 1000;
  }

  // top 100 by balance
  const { data: inv } = await sb
    .from('invoices')
    .select('id, invoice_number, invoice_date, balance, customer_id, city, business_unit')
    .eq('status', 'open')
    .order('balance', { ascending: false })
    .limit(100);

  // join customer names (no FK embed — manual map)
  const ids = [...new Set((inv || []).map((i) => i.customer_id).filter(Boolean))];
  const cmap = {};
  if (ids.length) {
    const { data: custs } = await sb.from('customers').select('id, name, cb_number, phone').in('id', ids);
    (custs || []).forEach((c) => { cmap[c.id] = c; });
  }

  return (
    <div className="wrap">
      <div className="h1">💰 Past Due</div>

      <div className="card card-amber" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--amber)' }}>{money(total)}</div>
          <div className="muted" style={{ fontSize: 11 }}>total outstanding</div>
        </div>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{count.toLocaleString()}</div>
          <div className="muted" style={{ fontSize: 11 }}>open invoices</div>
        </div>
        <div className="muted" style={{ fontSize: 12, flex: 1, minWidth: 180 }}>
          Top 100 by balance below. <Link href="/customers">search a customer →</Link>
        </div>
      </div>

      {(inv || []).map((i) => {
        const c = cmap[i.customer_id] || {};
        return (
          <div key={i.id} className="card" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {c.name || 'Unknown customer'}
                {c.cb_number && <span className="pill" style={{ marginLeft: 8, color: 'var(--amber)' }}>CB-{c.cb_number}</span>}
              </div>
              <div className="muted" style={{ marginTop: 3 }}>
                {c.phone ? '📞 ' + c.phone + ' · ' : ''}#{i.invoice_number}
                {i.invoice_date ? <span style={{ color: ageColor(i.invoice_date) }}> · {i.invoice_date}</span> : ''}
                {i.city ? ' · ' + i.city : ''}
              </div>
            </div>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--amber)', whiteSpace: 'nowrap' }}>{money(i.balance)}</div>
          </div>
        );
      })}
    </div>
  );
}
