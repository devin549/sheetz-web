import Link from 'next/link';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import { can } from '@/lib/roles';
import { COMPANY, companyReturnLines } from '@/lib/company';
import PrintButton from '../../packet/PrintButton';
import EmailStatementButton from '../../EmailStatementButton';

export const dynamic = 'force-dynamic';

const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const daysSince = (ms) => (ms ? Math.floor((Date.now() - ms) / 86400000) : null);
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return iso || '—'; } };

const P = {
  page: { background: '#fff', color: '#111', maxWidth: 820, margin: '0 auto', padding: '0 0 60px', fontSize: 13, lineHeight: 1.5 },
  sheet: { background: '#fff', color: '#111', border: '1px solid #ddd', borderRadius: 8, padding: '36px 44px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' },
  label: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em', color: '#888', margin: '22px 0 6px' },
  th: { textAlign: 'left', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: '#777', padding: '6px 8px', borderBottom: '2px solid #ccc' },
  td: { padding: '7px 8px', borderBottom: '1px solid #eee', fontSize: 12.5 },
  num: { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
};

export default async function Statement({ params }) {
  const { role } = await requireHref('/past-due');
  if (!can(role, 'seeFinancials')) return <div className="wrap"><div className="h1">📄 Statement</div><div className="notice">Your role can’t view statements.</div></div>;
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">📄 Statement</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;

  const cid = params.cid;
  const sb = getSupabaseAdmin();
  const { data: cust } = await sb.from('customers').select('name, cb_number, address, phone, email').eq('id', cid).maybeSingle();
  const { data: invRows } = await sb.from('invoices').select('invoice_number, invoice_date, balance, city').eq('customer_id', cid).eq('status', 'open');

  const invoices = (invRows || []).map((i) => ({ ...i, bal: Number(i.balance) || 0, ms: i.invoice_date ? new Date(i.invoice_date).getTime() : null })).sort((a, b) => (a.ms || 0) - (b.ms || 0));
  const total = invoices.reduce((a, i) => a + i.bal, 0);
  const aging = { cur: 0, d60: 0, d90: 0, d90p: 0 };
  invoices.forEach((i) => { const d = i.ms ? (Date.now() - i.ms) / 86400000 : 0; if (d > 90) aging.d90p += i.bal; else if (d > 60) aging.d90 += i.bal; else if (d > 30) aging.d60 += i.bal; else aging.cur += i.bal; });
  const today = fmtDate(new Date().toISOString());

  return (
    <div className="wrap" style={{ maxWidth: 880 }}>
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <Link href="/past-due" style={{ fontSize: 13 }}>← Back to A/R</Link>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <EmailStatementButton customerId={cid} hasEmail={!!cust?.email} />
          <PrintButton />
        </div>
      </div>

      {/* fold guides — only print; help fold in thirds so the address shows through a #10 window envelope */}
      <style>{`@media screen{.cb-fold{display:none}}@media print{.cb-fold{position:fixed;left:0;width:26px;border-top:1px dashed #bbb;color:#bbb;font-size:7px;letter-spacing:.5px}.cb-fold-1{top:3.667in}.cb-fold-2{top:7.333in}}`}</style>
      <span className="cb-fold cb-fold-1">fold</span>
      <span className="cb-fold cb-fold-2">fold</span>

      <div style={P.page}>
        <div style={P.sheet}>
          {/* letterhead — company return address (top-left) + contact, so the customer can reach us */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #111', paddingBottom: 14 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              {COMPANY.logo && <img src={COMPANY.logo} alt={COMPANY.name} style={{ height: 46, width: 'auto' }} />}
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{COMPANY.name}</div>
                {companyReturnLines().slice(1).map((l, i) => <div key={i} style={{ fontSize: 11, color: '#555' }}>{l}</div>)}
                <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>📞 {COMPANY.phone} · ✉️ {COMPANY.email}</div>
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 11, color: '#666' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>STATEMENT OF ACCOUNT</div>
              <div>As of {today}</div>
            </div>
          </div>

          {/* bill-to (positioned for a #10 window envelope) + balance */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, marginTop: 22 }}>
            <div>
              <div style={P.label}>Bill to</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{cust?.name || 'Customer'}</div>
              {cust?.address && <div style={{ color: '#333' }}>{cust.address}</div>}
              {cust?.cb_number && <div style={{ color: '#777', fontSize: 11, marginTop: 2 }}>Account CB-{cust.cb_number}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={P.label}>Balance due</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{money(total)}</div>
              <div style={{ fontSize: 11, color: '#888' }}>{invoices.length} open invoice{invoices.length === 1 ? '' : 's'}</div>
            </div>
          </div>

          {/* invoice list */}
          <div style={P.label}>Open invoices</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={P.th}>Date</th><th style={P.th}>Invoice #</th><th style={P.th}>Service location</th><th style={{ ...P.th, textAlign: 'right' }}>Days</th><th style={{ ...P.th, textAlign: 'right' }}>Amount</th></tr></thead>
            <tbody>
              {!invoices.length && <tr><td style={P.td} colSpan={5}>No open invoices — account is current. Thank you!</td></tr>}
              {invoices.map((i, x) => (
                <tr key={x}>
                  <td style={P.td}>{i.invoice_date ? fmtDate(i.invoice_date) : '—'}</td>
                  <td style={P.td}>#{i.invoice_number || '—'}</td>
                  <td style={P.td}>{i.city || '—'}</td>
                  <td style={{ ...P.td, ...P.num }}>{i.ms != null ? daysSince(i.ms) : '—'}</td>
                  <td style={{ ...P.td, ...P.num, fontWeight: 700 }}>{money(i.bal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td style={{ ...P.td, fontWeight: 800, borderTop: '2px solid #ccc' }} colSpan={4}>Total balance due</td><td style={{ ...P.td, ...P.num, fontWeight: 800, borderTop: '2px solid #ccc' }}>{money(total)}</td></tr></tfoot>
          </table>

          {/* aging mini-summary */}
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', margin: '12px 0 4px', fontSize: 12 }}>
            <span>Current: <strong>{money(aging.cur)}</strong></span>
            <span>31–60: <strong>{money(aging.d60)}</strong></span>
            <span>61–90: <strong>{money(aging.d90)}</strong></span>
            <span style={{ color: '#b00020' }}>90+: <strong>{money(aging.d90p)}</strong></span>
          </div>

          <div style={{ marginTop: 18, paddingTop: 12, borderTop: '1px solid #eee', fontSize: 12, color: '#444' }}>
            Please remit payment for the balance due. Questions, or want to set up a payment plan?
            <strong> Call us at {COMPANY.phone}</strong> or email {COMPANY.email} — we’re glad to help.
          </div>
          <div style={{ marginTop: 16, fontSize: 10.5, color: '#999' }}>{COMPANY.name} · {COMPANY.phone} · {COMPANY.email} · Generated {today}.</div>
        </div>
      </div>
    </div>
  );
}
