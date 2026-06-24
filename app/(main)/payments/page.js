import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';

export const dynamic = 'force-dynamic';

const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmt = (iso) => { try { return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };
const shortName = (email) => String(email || '').split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()) || '—';

export default async function Payments() {
  await requireHref('/payments');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Payment Ledger</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('ar_activity')
    .select('id, action, customer_name, invoice_number, amount, by_email, created_at')
    .order('created_at', { ascending: false }).limit(200);
  const rows = data || [];

  const now = Date.now();
  const dayAgo = now - 86400000, weekAgo = now - 7 * 86400000;
  const sum = (since) => rows.filter((r) => new Date(r.created_at).getTime() >= since).reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const today = sum(dayAgo), week = sum(weekAgo);

  const Kpi = ({ label, val }) => (
    <div style={{ flex: '1 1 140px' }}>
      <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>{money(val)}</div>
    </div>
  );

  return (
    <div className="wrap" style={{ maxWidth: 940 }}>
      <div className="h1">Payment Ledger</div>
      <p className="muted">Every payment recorded — the accounting bot&apos;s audit trail. Fed by Mark-paid on <a href="/past-due">Past Due</a>.</p>

      <div className="card" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', borderTop: '2px solid var(--green)' }}>
        <Kpi label="Collected (24h)" val={today} />
        <Kpi label="Collected (7d)" val={week} />
        <div style={{ flex: '1 1 140px' }}><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px' }}>Entries</div><div style={{ fontSize: 22, fontWeight: 800 }}>{rows.length}</div></div>
      </div>

      {error && (
        <div className="notice">
          {/could not find|does not exist|schema cache/i.test(error.message || '')
            ? <>Payment Ledger needs the AR-activity table — run <code>supabase/12_ar_activity.sql</code> in Supabase. It then fills as you mark invoices paid on Past Due.</>
            : <>Couldn’t load: {error.message}</>}
        </div>
      )}
      {!error && !rows.length && <div className="card"><span className="muted">No payments logged yet — they appear here the moment you mark an invoice or customer paid on Past Due.</span></div>}

      {rows.length > 0 && (
        <div className="card" style={{ padding: 0, overflowX: 'auto', marginTop: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr>
              {['When', 'Customer', 'Invoice', 'Type', 'Amount', 'By'].map((h, i) => (
                <th key={h} style={{ padding: '8px 12px', textAlign: i === 4 ? 'right' : 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--fg-3)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '9px 12px', color: 'var(--fg-3)', fontFamily: 'var(--mono)', fontSize: 12, whiteSpace: 'nowrap' }}>{fmt(r.created_at)}</td>
                  <td style={{ padding: '9px 12px', fontWeight: 600 }}>{r.customer_name || 'Customer'}</td>
                  <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)', fontSize: 12 }}>{r.invoice_number || '—'}</td>
                  <td style={{ padding: '9px 12px' }}><span className="pill" style={{ fontSize: 10.5 }}>{r.action === 'customer_paid' ? 'Customer paid' : 'Invoice paid'}</span></td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--green)' }}>{money(r.amount)}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--fg-3)', fontSize: 12 }}>{shortName(r.by_email)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
