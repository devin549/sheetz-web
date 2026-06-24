import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';

export const dynamic = 'force-dynamic';

const money = (n) => { const v = Number(n || 0); return v >= 1000 ? '$' + (v / 1000).toFixed(v >= 100000 ? 0 : 1) + 'k' : '$' + Math.round(v); };
const moneyFull = (n) => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const ago = (iso) => { if (!iso) return '—'; try { const d = (Date.now() - new Date(iso).getTime()) / 86400000; if (d < 31) return Math.max(0, Math.floor(d)) + 'd'; if (d < 365) return Math.floor(d / 30) + 'mo'; return (d / 365).toFixed(1) + 'y'; } catch { return '—'; } };

export default async function TopCustomers() {
  await requireHref('/top-customers');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Top Customers</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const { count } = await sb.from('customers').select('id', { count: 'exact', head: true });
  const { data, error } = await sb.from('customers')
    .select('id, name, type, cb_number, do_not_service, lifetime_revenue, lifetime_jobs, lifetime_invoices, last_job_completed')
    .order('lifetime_revenue', { ascending: false, nullsFirst: false })
    .limit(50);
  const rows = data || [];
  const topSum = rows.reduce((s, r) => s + (Number(r.lifetime_revenue) || 0), 0);

  const Th = ({ children, l }) => <th style={{ padding: '8px 12px', textAlign: l ? 'left' : 'right', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--fg-3)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{children}</th>;

  return (
    <div className="wrap" style={{ maxWidth: 940 }}>
      <div className="h1">Top Customers</div>
      <p className="muted">Book of business by lifetime value{count != null ? ` · ${count.toLocaleString()} customers total` : ''}. Top 50 here = <strong style={{ color: 'var(--green)' }}>{moneyFull(topSum)}</strong> lifetime.</p>

      {error && <div className="notice">Couldn’t load: {error.message}</div>}
      {!error && (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr>
              <Th l>#</Th><Th l>Customer</Th><Th>Lifetime $</Th><Th>Jobs</Th><Th>Invoices</Th><Th>Last job</Th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '9px 12px', color: 'var(--fg-3)', fontFamily: 'var(--mono)', fontSize: 12 }}>{i + 1}</td>
                  <td style={{ padding: '9px 12px', fontWeight: 700, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.name}
                    {r.cb_number ? <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}> · CB-{r.cb_number}</span> : null}
                    {r.type ? <span className="pill" style={{ fontSize: 9.5, marginLeft: 6 }}>{r.type}</span> : null}
                    {r.do_not_service ? <span className="pill pill-red" style={{ fontSize: 9.5, marginLeft: 4 }}>DNS</span> : null}
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--green)' }}>{money(r.lifetime_revenue)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{Number(r.lifetime_jobs || 0).toLocaleString()}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--fg-3)' }}>{Number(r.lifetime_invoices || 0).toLocaleString()}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--fg-3)', fontSize: 12 }}>{ago(r.last_job_completed)}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={6} style={{ padding: 16 }}><span className="muted">No customers yet.</span></td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Ranked by lifetime revenue from the imported book. Next tweaks (your call): search the full base, filter by type/business unit, or add open-AR per account.</p>
    </div>
  );
}
