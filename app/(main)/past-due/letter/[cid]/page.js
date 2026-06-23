import Link from 'next/link';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import { can } from '@/lib/roles';
import { COMPANY, companyReturnLines } from '@/lib/company';
import PrintButton from '../../packet/PrintButton';

export const dynamic = 'force-dynamic';

const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const daysSince = (ms) => (ms ? Math.floor((Date.now() - ms) / 86400000) : null);
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }); } catch { return iso || '—'; } };

const P = {
  page: { background: '#fff', color: '#111', maxWidth: 820, margin: '0 auto', padding: '0 0 60px', fontSize: 13.5, lineHeight: 1.6 },
  sheet: { background: '#fff', color: '#111', border: '1px solid #ddd', borderRadius: 8, padding: '40px 48px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' },
  th: { textAlign: 'left', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: '#777', padding: '6px 8px', borderBottom: '2px solid #ccc' },
  td: { padding: '7px 8px', borderBottom: '1px solid #eee', fontSize: 12.5 },
  num: { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
};

export default async function CertifiedLetter({ params, searchParams }) {
  const { role } = await requireHref('/past-due');
  if (!can(role, 'seeFinancials')) return <div className="wrap"><div className="h1">📜 Certified letter</div><div className="notice">Your role can’t view collections letters.</div></div>;
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">📜 Certified letter</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;

  const cid = params.cid;
  const payDays = Math.max(3, Math.min(30, parseInt(searchParams?.days, 10) || 10));
  const tracking = (searchParams?.tracking || '').toString().slice(0, 40);

  const sb = getSupabaseAdmin();
  const { data: cust } = await sb.from('customers').select('name, cb_number, address').eq('id', cid).maybeSingle();
  const { data: invRows } = await sb.from('invoices').select('invoice_number, invoice_date, balance, city').eq('customer_id', cid).eq('status', 'open');

  const invoices = (invRows || []).map((i) => ({ ...i, bal: Number(i.balance) || 0, ms: i.invoice_date ? new Date(i.invoice_date).getTime() : null })).sort((a, b) => (a.ms || 0) - (b.ms || 0));
  const total = invoices.reduce((a, i) => a + i.bal, 0);
  const oldestMs = invoices.reduce((m, i) => (i.ms && (m == null || i.ms < m) ? i.ms : m), null);
  const oldestDays = daysSince(oldestMs);
  const today = fmtDate(new Date().toISOString());

  return (
    <div className="wrap" style={{ maxWidth: 880 }}>
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <Link href="/past-due" style={{ fontSize: 13 }}>← Back to A/R</Link>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>FINAL demand · certified mail. Add <code>?tracking=</code> + <code>?days=</code> to the URL to fill the tracking # / payment window.</div>
        </div>
        <PrintButton />
      </div>

      <div style={P.page}>
        <div style={P.sheet}>
          {/* letterhead */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', borderBottom: '2px solid #111', paddingBottom: 12, marginBottom: 16 }}>
            {COMPANY.logo && <img src={COMPANY.logo} alt={COMPANY.name} style={{ height: 46, width: 'auto' }} />}
            <div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{COMPANY.name}</div>
              {companyReturnLines().slice(1).map((l, i) => <div key={i} style={{ fontSize: 11, color: '#555' }}>{l}</div>)}
              <div style={{ fontSize: 11, color: '#555' }}>📞 {COMPANY.phone} · ✉️ {COMPANY.email}</div>
            </div>
          </div>

          <div style={{ fontSize: 12 }}>{today}</div>

          {/* certified-mail block */}
          <div style={{ margin: '14px 0', padding: '10px 12px', border: '1px solid #bbb', background: '#fafafa', fontSize: 11.5, fontWeight: 700, letterSpacing: '.03em' }}>
            VIA USPS CERTIFIED MAIL — RETURN RECEIPT REQUESTED<br />
            <span style={{ fontWeight: 400 }}>Tracking No.: {tracking || '____________________________'}</span>
          </div>

          {/* recipient */}
          <div style={{ margin: '14px 0' }}>
            <div style={{ fontWeight: 700 }}>{cust?.name || 'Customer'}</div>
            {cust?.address && <div>{cust.address}</div>}
            {cust?.cb_number && <div style={{ color: '#666', fontSize: 11.5 }}>Account CB-{cust.cb_number}</div>}
          </div>

          <div style={{ fontWeight: 700, margin: '10px 0' }}>RE: FINAL NOTICE — Past-Due Balance of {money(total)}{oldestDays != null ? ` (${oldestDays} days delinquent)` : ''}</div>

          <p>Dear {cust?.name || 'Customer'},</p>
          <p>
            Our records show a past-due balance of <strong>{money(total)}</strong> owed to Clog Busterz Plumbing for plumbing
            labor and materials furnished to you, itemized below. Despite prior attempts to reach you, this balance remains unpaid.
          </p>
          <p>
            This letter is a <strong>FINAL DEMAND</strong> for payment. You must remit the full amount of <strong>{money(total)}</strong> within
            <strong> {payDays} days</strong> of the date of this letter. If payment is not received, Clog Busterz Plumbing intends to pursue all
            available remedies, which may include filing a <strong>mechanic’s / materialman’s lien</strong> against the property under
            Kentucky law (KRS Chapter 376) and referring this account to our collections attorney, with interest and reasonable costs
            of collection added to the amount due.
          </p>
          <p>To resolve this immediately, or to arrange a payment plan, contact our office upon receipt of this notice.</p>

          {/* invoice schedule */}
          <table style={{ width: '100%', borderCollapse: 'collapse', margin: '12px 0' }}>
            <thead><tr><th style={P.th}>Invoice #</th><th style={P.th}>Date</th><th style={P.th}>Job site</th><th style={{ ...P.th, textAlign: 'right' }}>Balance</th></tr></thead>
            <tbody>
              {!invoices.length && <tr><td style={P.td} colSpan={4}>No open invoices.</td></tr>}
              {invoices.map((i, x) => (
                <tr key={x}>
                  <td style={P.td}>#{i.invoice_number || '—'}</td>
                  <td style={P.td}>{i.invoice_date ? fmtDate(i.invoice_date) : '—'}</td>
                  <td style={P.td}>{i.city || '—'}</td>
                  <td style={{ ...P.td, ...P.num, fontWeight: 700 }}>{money(i.bal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td style={{ ...P.td, fontWeight: 800, borderTop: '2px solid #ccc' }} colSpan={3}>Total now due</td><td style={{ ...P.td, ...P.num, fontWeight: 800, borderTop: '2px solid #ccc' }}>{money(total)}</td></tr></tfoot>
          </table>

          <p style={{ marginTop: 18 }}>Sincerely,</p>
          <div style={{ height: 34 }} />
          <div style={{ fontWeight: 700 }}>Clog Busterz Plumbing</div>
          <div style={{ color: '#555', fontSize: 12 }}>Accounts Receivable Department</div>

          <div style={{ marginTop: 22, paddingTop: 12, borderTop: '1px solid #eee', fontSize: 10.5, color: '#999' }}>
            Generated by the Clog Busterz Sheetz web app on {today}. Internal draft for review — confirm wording, the payment window,
            and lien eligibility with counsel before mailing. After mailing, log the certified tracking number and attach the signed
            return receipt as proof of delivery.
          </div>
        </div>
      </div>
    </div>
  );
}
