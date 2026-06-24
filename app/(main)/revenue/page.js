import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';

export const dynamic = 'force-dynamic';

const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

// REST caps at 1000 rows/request; page through so the totals cover every invoice.
async function allInvoices(sb) {
  const all = [];
  for (let from = 0; from < 8000; from += 1000) {
    const { data, error } = await sb.from('invoices').select('total, balance, status, business_unit').range(from, from + 999);
    if (error) return { rows: all, error };
    if (!data || !data.length) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  return { rows: all, error: null };
}

export default async function Revenue() {
  await requirePerm('seeFinancials', 'seeRevenue', 'seeReports');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Revenue</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const { rows: inv, error } = await allInvoices(sb);

  const booked = inv.reduce((s, i) => s + (Number(i.total) || 0), 0);
  const openAR = inv.reduce((s, i) => s + (Number(i.balance) || 0), 0);
  const collected = booked - openAR;
  const openCount = inv.filter((i) => Number(i.balance) > 0).length;

  const byBU = {};
  inv.forEach((i) => { const k = i.business_unit || 'Unassigned'; const m = (byBU[k] = byBU[k] || { booked: 0, open: 0, count: 0 }); m.booked += Number(i.total) || 0; m.open += Number(i.balance) || 0; m.count += 1; });
  const bus = Object.entries(byBU).map(([k, m]) => ({ k, ...m })).sort((a, b) => b.booked - a.booked);

  const byStatus = {};
  inv.forEach((i) => { const k = String(i.status || 'open').toLowerCase(); byStatus[k] = (byStatus[k] || 0) + 1; });

  const Kpi = ({ label, val, color }) => (
    <div style={{ flex: '1 1 150px', minWidth: 130 }}>
      <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--fg-1)' }}>{money(val)}</div>
    </div>
  );

  return (
    <div className="wrap" style={{ maxWidth: 920 }}>
      <div className="h1">Revenue</div>
      <p className="muted">Across all {inv.length.toLocaleString()} invoices. Cost-based profit ports later (needs job costs) — this is booked + collected + open AR. Full aging → <a href="/past-due">Past Due</a>.</p>

      {error && <div className="notice">Couldn’t load invoices: {error.message}</div>}

      <div className="card" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', borderTop: '2px solid var(--accent)' }}>
        <Kpi label="Booked (lifetime)" val={booked} color="var(--accent)" />
        <Kpi label="Collected" val={collected} color="var(--green)" />
        <Kpi label="Open AR" val={openAR} color="var(--red)" />
        <div style={{ flex: '1 1 130px', minWidth: 120 }}>
          <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px' }}>Open invoices</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{openCount.toLocaleString()}</div>
        </div>
      </div>

      <h3 style={{ fontSize: 12, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.5px', margin: '20px 0 8px' }}>By business unit</h3>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr>
            {['Business unit', 'Invoices', 'Booked', 'Open AR'].map((h, i) => (
              <th key={h} style={{ padding: '8px 12px', textAlign: i === 0 ? 'left' : 'right', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--fg-3)', borderBottom: '1px solid var(--border)' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {bus.map((b) => (
              <tr key={b.k} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '9px 12px', fontWeight: 700 }}>{b.k}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{b.count.toLocaleString()}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>{money(b.booked)}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--mono)', color: b.open > 0 ? 'var(--red)' : 'var(--fg-3)' }}>{money(b.open)}</td>
              </tr>
            ))}
            {!bus.length && <tr><td colSpan={4} style={{ padding: 16 }}><span className="muted">No invoices.</span></td></tr>}
          </tbody>
        </table>
      </div>

      {Object.keys(byStatus).length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          {Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
            <span key={k} className="pill" style={{ fontSize: 11.5, textTransform: 'capitalize' }}>{k} <strong>{n.toLocaleString()}</strong></span>
          ))}
        </div>
      )}
    </div>
  );
}
