import Link from 'next/link';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import { can } from '@/lib/roles';
import { COMPANY } from '@/lib/company';
import PrintButton from '../packet/PrintButton';

export const dynamic = 'force-dynamic';

const money = (n) => (n ? '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return iso || ''; } };

// Ashley's 5 aging bands (Current / 30 / 60 / 90 / Over 90), by days since invoice.
function band(days) {
  if (days == null || days <= 30) return 'current';
  if (days <= 60) return 'b30';
  if (days <= 90) return 'b60';
  if (days <= 120) return 'b90';
  return 'over90';
}
const BANDS = [['current', 'Current'], ['b30', '30 Days'], ['b60', '60 Days'], ['b90', '90 Days'], ['over90', 'Over 90']];

const P = {
  page: { background: '#fff', color: '#111', maxWidth: 1040, margin: '0 auto', padding: '0 0 60px', fontSize: 11.5 },
  sheet: { background: '#fff', color: '#111', border: '1px solid #ddd', borderRadius: 8, padding: '30px 34px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' },
  th: { textAlign: 'right', fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.03em', color: '#666', padding: '6px 6px', borderBottom: '2px solid #bbb' },
  td: { padding: '5px 6px', borderBottom: '1px solid #eee', fontSize: 11, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
};

export default async function ArReport() {
  const { role } = await requireHref('/past-due');
  if (!can(role, 'seeFinancials')) return <div className="wrap"><div className="h1">📄 AR aging report</div><div className="notice">Your role can’t view the A/R report.</div></div>;
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">📄 AR aging report</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;

  const sb = getSupabaseAdmin();
  const now = Date.now();
  const byCust = {}; const grand = { current: 0, b30: 0, b60: 0, b90: 0, over90: 0, total: 0 };
  let from = 0;
  while (true) {
    const { data } = await sb.from('invoices').select('balance, invoice_date, customer_id').eq('status', 'open').range(from, from + 999);
    if (!data || !data.length) break;
    data.forEach((i) => {
      const cid = i.customer_id || '__none__';
      const bal = Number(i.balance) || 0;
      const days = i.invoice_date ? Math.floor((now - new Date(i.invoice_date).getTime()) / 86400000) : null;
      const k = band(days);
      const g = byCust[cid] = byCust[cid] || { current: 0, b30: 0, b60: 0, b90: 0, over90: 0, total: 0 };
      g[k] += bal; g.total += bal; grand[k] += bal; grand.total += bal;
    });
    if (data.length < 1000) break; from += 1000;
  }

  const ids = Object.keys(byCust).filter((id) => id !== '__none__');
  const cmap = {}; const noteMap = {};
  for (let i = 0; i < ids.length; i += 300) {
    const { data: cs } = await sb.from('customers').select('id, name').in('id', ids.slice(i, i + 300));
    (cs || []).forEach((c) => { cmap[c.id] = c.name; });
  }
  try {
    for (let i = 0; i < ids.length; i += 300) {
      const { data: ns } = await sb.from('ar_notes').select('customer_id, note').in('customer_id', ids.slice(i, i + 300));
      (ns || []).forEach((n) => { if (n.note) noteMap[n.customer_id] = n.note; });
    }
  } catch (_) {}

  const rows = Object.entries(byCust)
    .map(([cid, g]) => ({ cid, name: cmap[cid] || 'Unknown customer', note: noteMap[cid] || '', ...g }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const today = fmtDate(new Date().toISOString());

  return (
    <div className="wrap" style={{ maxWidth: 1100 }}>
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <Link href="/past-due" style={{ fontSize: 13 }}>← Back to A/R</Link>
        <PrintButton />
      </div>

      <div style={P.page}>
        <div style={P.sheet}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #111', paddingBottom: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {COMPANY.logo && <img src={COMPANY.logo} alt={COMPANY.name} style={{ height: 40, width: 'auto' }} />}
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{COMPANY.name}</div>
                <div style={{ fontSize: 11, color: '#666' }}>Accounts Receivable — Aging Report</div>
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 11, color: '#666' }}>
              <div>As of {today}</div>
              <div>{rows.length} customers · {money(grand.total)} due</div>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...P.th, textAlign: 'left' }}>Customer</th>
                {BANDS.map(([k, lbl]) => <th key={k} style={P.th}>{lbl}</th>)}
                <th style={{ ...P.th, borderBottomColor: '#111' }}>Total Due</th>
                <th style={{ ...P.th, textAlign: 'left', width: 220 }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.cid}>
                  <td style={{ ...P.td, textAlign: 'left', fontWeight: 600 }}>{r.name}</td>
                  {BANDS.map(([k]) => <td key={k} style={{ ...P.td, color: k === 'over90' && r[k] ? '#b00020' : '#111' }}>{money(r[k])}</td>)}
                  <td style={{ ...P.td, fontWeight: 800 }}>{money(r.total)}</td>
                  <td style={{ ...P.td, textAlign: 'left', whiteSpace: 'normal', color: /do not service|dns/i.test(r.note) ? '#b00020' : '#444', fontWeight: /do not service|dns/i.test(r.note) ? 700 : 400 }}>{r.note || ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ ...P.td, textAlign: 'left', fontWeight: 800, borderTop: '2px solid #111' }}>Totals</td>
                {BANDS.map(([k]) => <td key={k} style={{ ...P.td, fontWeight: 800, borderTop: '2px solid #111' }}>{money(grand[k])}</td>)}
                <td style={{ ...P.td, fontWeight: 800, borderTop: '2px solid #111' }}>{money(grand.total)}</td>
                <td style={{ ...P.td, borderTop: '2px solid #111' }} />
              </tr>
            </tfoot>
          </table>

          <div style={{ marginTop: 16, fontSize: 10, color: '#999' }}>Generated by Clog Busterz Plumbing — {today}. Aging by invoice date (Current ≤30 · 30 · 60 · 90 · Over 90 days).</div>
        </div>
      </div>
    </div>
  );
}
