import Link from 'next/link';
import { loadCockpitMoney } from '../../cockpit';
import { WORK_AUTHORIZATION_TERMS } from '@/lib/estimateTerms';

export const dynamic = 'force-dynamic';
const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (iso) => { if (!iso) return ''; try { return new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; } };

// 🧾 Customer-facing INVOICE SUMMARY — print-friendly (browser "Save as PDF"). Matches the ClogBusterz format:
// DESCRIPTION OF WORK · line table (code · description · qty · price · total) · totals · payment · terms ·
// authorization. Built from the approved estimate lines + the job's AI-watched work summary + the invoice row.
export default async function InvoiceSummary({ params }) {
  const c = await loadCockpitMoney(params.id);
  if (!c.configured) return <div className="wrap"><div className="h1">Invoice</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;

  let est = null, inv = null, workSummary = '';
  const ESTSEL = 'lines, subtotal, headline, status, approved_name, approval_method, consent_text, responded_at';
  try {
    let { data, error } = await c.sb.from('pricebook_estimates').select(ESTSEL + ', signature_data, signed_at').eq('job_id', c.job.id).order('created_at', { ascending: false }).limit(20);
    if (error && /signature|column|schema cache/i.test(error.message || '')) ({ data } = await c.sb.from('pricebook_estimates').select(ESTSEL).eq('job_id', c.job.id).order('created_at', { ascending: false }).limit(20)); // pre-139
    est = (data || []).find((e) => e.status === 'approved') || (data || [])[0] || null;
  } catch (_) {}
  try { const { data } = await c.sb.from('invoices').select('invoice_number, total, balance, status, invoice_date, due_date').eq('job_id', String(params.id)).order('created_at', { ascending: false }).limit(1).maybeSingle(); inv = data || null; } catch (_) {}
  try { const { data } = await c.sb.from('jobs').select('work_summary').eq('id', String(params.id)).maybeSingle(); workSummary = data?.work_summary || ''; } catch (_) {}

  const lines = Array.isArray(est?.lines) ? est.lines : [];
  const sub = Number(est?.subtotal) || lines.reduce((s, l) => s + (Number(l.price) || 0) * (Number(l.quantity) || 1), 0) || Number(inv?.total) || 0;
  const balance = inv ? Number(inv.balance) || 0 : sub;
  const payment = inv ? Math.max(0, sub - balance) : 0;
  const cust = c.customer || {};
  const cardBorder = '1px solid #d8d2c4';

  return (
    <div style={{ background: '#fff', color: '#1a1a1a', minHeight: '100vh', padding: '24px 18px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {/* screen-only controls (hidden on print) */}
        <div className="no-print" style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <Link href={`/job/${params.id}/invoice`} style={{ fontSize: 13, color: '#9a6a00', textDecoration: 'none' }}>← Invoice</Link>
          <span style={{ marginLeft: 'auto' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #1a1a1a', paddingBottom: 12 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>Clog Busterz Plumbing</div>
            <div style={{ fontSize: 12, color: '#555', lineHeight: 1.5 }}>105 Moberly Rd, Richmond KY 40475<br />859-408-3382 · Dispatch@clogbusterzplumbing.com</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.1em', color: '#9a6a00' }}>INVOICE</div>
            <div style={{ fontWeight: 800 }}>{inv?.invoice_number || (c.job.job_number ? `INV-${c.job.job_number}` : '')}</div>
            <div style={{ fontSize: 12, color: '#555' }}>{fmt(inv?.invoice_date || est?.responded_at)}</div>
            {inv?.due_date && <div style={{ fontSize: 12, color: '#555' }}>Due: {fmt(inv.due_date)}</div>}
          </div>
        </div>

        {/* Bill to */}
        <div style={{ margin: '14px 0' }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: '#888', letterSpacing: '.05em' }}>BILL TO</div>
          <div style={{ fontWeight: 700 }}>{cust.name || 'Customer'}</div>
          {cust.address && <div style={{ fontSize: 13, color: '#555' }}>{cust.address}</div>}
        </div>

        {/* Description of work */}
        {workSummary && (
          <div style={{ margin: '14px 0', padding: '12px 14px', background: '#faf8f2', border: cardBorder, borderRadius: 8 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: '#888', letterSpacing: '.05em', marginBottom: 4 }}>DESCRIPTION OF WORK</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{workSummary}</div>
          </div>
        )}

        {/* Line table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1a1a1a', textAlign: 'left', fontSize: 10.5, color: '#888', letterSpacing: '.05em' }}>
              <th style={{ padding: '6px 4px' }}>ITEM</th><th style={{ padding: '6px 4px' }}>DESCRIPTION</th>
              <th style={{ padding: '6px 4px', textAlign: 'right' }}>QTY</th><th style={{ padding: '6px 4px', textAlign: 'right' }}>PRICE</th><th style={{ padding: '6px 4px', textAlign: 'right' }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {lines.length ? lines.map((l, i) => {
              const qty = Number(l.quantity) || 1; const price = Number(l.price) || 0;
              return (
                <tr key={i} style={{ borderBottom: cardBorder, verticalAlign: 'top' }}>
                  <td style={{ padding: '8px 4px', fontWeight: 700 }}>{l.name || 'Service'}</td>
                  <td style={{ padding: '8px 4px', color: '#444', lineHeight: 1.5 }}>{l.description || ''}</td>
                  <td style={{ padding: '8px 4px', textAlign: 'right' }}>{qty.toFixed(2)}</td>
                  <td style={{ padding: '8px 4px', textAlign: 'right' }}>{money(price)}</td>
                  <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 700 }}>{money(price * qty)}</td>
                </tr>
              );
            }) : <tr><td colSpan={5} style={{ padding: '10px 4px', color: '#888' }}>No line items on file for this invoice.</td></tr>}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ marginTop: 12, marginLeft: 'auto', width: 260 }}>
          {[['Sub-total', sub], ['Total due', sub], ...(payment > 0 ? [['Payment', -payment]] : []), ['Balance due', balance]].map(([k, v], i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, fontWeight: k === 'Balance due' ? 900 : 600, borderTop: k === 'Balance due' ? '1px solid #1a1a1a' : 'none', color: k === 'Balance due' && balance <= 0 ? '#1f7a3d' : '#1a1a1a' }}>
              <span>{k}</span><span>{v < 0 ? '-' : ''}{money(Math.abs(v))}</span>
            </div>
          ))}
          {balance <= 0 && payment > 0 && <div style={{ textAlign: 'right', fontSize: 12, color: '#1f7a3d', fontWeight: 800, marginTop: 2 }}>PAID — thank you!</div>}
        </div>

        {/* Authorization */}
        {est?.approved_name && (
          <div style={{ marginTop: 18, padding: '10px 12px', border: cardBorder, borderRadius: 8, fontSize: 12, color: '#444' }}>
            <div style={{ fontWeight: 800, color: '#1a1a1a', marginBottom: 2 }}>Customer authorization</div>
            {est.consent_text || `Approved by ${est.approved_name}${est.approval_method ? ` (${est.approval_method})` : ''}.`}{est.responded_at ? ` · ${fmt(est.responded_at)}` : ''}
            {est.signature_data && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 10, color: '#888' }}>Signature</div>
                <img src={est.signature_data} alt="Customer signature" style={{ maxHeight: 80, maxWidth: 280, background: '#fff', border: '1px solid #e3ddcf', borderRadius: 6 }} />
                <div style={{ fontSize: 11, color: '#1a1a1a', borderTop: '1px solid #1a1a1a', width: 280, marginTop: 2, paddingTop: 2 }}>{est.approved_name}{est.signed_at ? ` · ${fmt(est.signed_at)}` : ''}</div>
              </div>
            )}
          </div>
        )}

        {/* Terms — verbatim Work Authorization & Terms and Conditions (drafted by counsel). */}
        <div style={{ marginTop: 14, fontSize: 9.5, color: '#666', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{WORK_AUTHORIZATION_TERMS}</div>
        <div style={{ marginTop: 8, fontSize: 10, color: '#999', textAlign: 'center' }}>Thank you for choosing Clog Busterz Plumbing!</div>
      </div>
    </div>
  );
}
