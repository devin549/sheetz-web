import Link from 'next/link';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import { can } from '@/lib/roles';
import PrintButton from '../PrintButton';

export const dynamic = 'force-dynamic';

// ── Collections attorneys (from the live record — see memory). Devin picks per case. ──
const FIRMS = {
  fore: { atty: 'Michael Fore, Esq.', firm: 'Simons Fore', email: 'micheal@simonsfore.com', city: 'Lexington, KY' },
  mckinstry: { atty: 'Taft A. McKinstry, Esq.', firm: 'Fowler Bell PLLC', email: 'TMcKinstry@fowlerlaw.com', city: 'Lexington, KY' },
};

const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const daysSince = (ms) => (ms ? Math.floor((Date.now() - ms) / 86400000) : null);
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return iso || '—'; } };
const CH = { text: '📱 Text / SMS', email: '✉️ Email', call: '📞 Phone call', letter: '📨 Mailed letter', certified: '📜 Certified mail', packet: '⚖️ Lawyer packet' };

// Plain-paper legal styling — explicit black-on-white so it prints identically in light OR dark mode.
const P = {
  page: { background: '#fff', color: '#111', maxWidth: 820, margin: '0 auto', padding: '0 0 60px', fontSize: 13, lineHeight: 1.5 },
  sheet: { background: '#fff', color: '#111', border: '1px solid #ddd', borderRadius: 8, padding: '34px 40px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' },
  h1: { fontSize: 19, fontWeight: 800, margin: '0 0 2px', letterSpacing: '-.01em' },
  label: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em', color: '#888', margin: '22px 0 6px' },
  th: { textAlign: 'left', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: '#777', padding: '6px 8px', borderBottom: '2px solid #ccc' },
  td: { padding: '7px 8px', borderBottom: '1px solid #eee', fontSize: 12.5, verticalAlign: 'top' },
  num: { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
};

export default async function LawyerPacket({ params, searchParams }) {
  const { role } = await requireHref('/past-due');
  const canViewFin = can(role, 'seeFinancials');
  const cid = params.cid;
  const firmKey = (searchParams?.firm || 'fore').toLowerCase();
  const firm = FIRMS[firmKey] || FIRMS.fore;

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">⚖️ Lawyer packet</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel to build the packet.</div></div>;
  }
  if (!canViewFin) {
    return <div className="wrap"><div className="h1">⚖️ Lawyer packet</div><div className="notice">Your role can’t view collections packets.</div></div>;
  }

  const sb = getSupabaseAdmin();
  const { data: cust } = await sb.from('customers').select('id, name, cb_number, phone, email, address').eq('id', cid).maybeSingle();
  const { data: invRows } = await sb.from('invoices').select('id, invoice_number, invoice_date, balance, city, status').eq('customer_id', cid).eq('status', 'open');
  const { data: log } = await sb.from('collections_log').select('channel, note, amount, aging_bucket, by_email, created_at').eq('customer_id', cid).order('created_at', { ascending: true });

  const invoices = (invRows || [])
    .map((i) => ({ ...i, bal: Number(i.balance) || 0, ms: i.invoice_date ? new Date(i.invoice_date).getTime() : null }))
    .sort((a, b) => (a.ms || 0) - (b.ms || 0));
  const total = invoices.reduce((a, i) => a + i.bal, 0);
  const oldestMs = invoices.reduce((m, i) => (i.ms && (m == null || i.ms < m) ? i.ms : m), null);
  const oldestDays = daysSince(oldestMs);

  const aging = { cur: 0, d60: 0, d90: 0, d90p: 0 };
  invoices.forEach((i) => { const d = i.ms ? (Date.now() - i.ms) / 86400000 : 0; if (d > 90) aging.d90p += i.bal; else if (d > 60) aging.d90 += i.bal; else if (d > 30) aging.d60 += i.bal; else aging.cur += i.bal; });

  const addr = cust?.address || '';
  const contacts = log || [];
  const today = fmtDate(new Date().toISOString());

  return (
    <div className="wrap" style={{ maxWidth: 880 }}>
      {/* toolbar — not printed */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <Link href="/past-due" style={{ fontSize: 13 }}>← Back to A/R</Link>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Attorney:&nbsp;
            <Link href={`?firm=fore`} style={{ fontWeight: firmKey === 'fore' ? 800 : 400 }}>Fore</Link>
            &nbsp;·&nbsp;
            <Link href={`?firm=mckinstry`} style={{ fontWeight: firmKey === 'mckinstry' ? 800 : 400 }}>McKinstry</Link>
          </div>
        </div>
        <PrintButton />
      </div>

      <div style={P.page}>
        <div style={P.sheet}>
          {/* letterhead */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #111', paddingBottom: 14 }}>
            <div>
              <div style={P.h1}>Clog Busterz Plumbing</div>
              <div style={{ fontSize: 11, color: '#666' }}>Accounts Receivable · Collections</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 11, color: '#666' }}>
              <div><strong>Collections / Lien Referral Packet</strong></div>
              <div>Prepared {today}</div>
            </div>
          </div>

          {/* attorney + debtor */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, marginTop: 18 }}>
            <div>
              <div style={P.label}>Referred to</div>
              <div style={{ fontWeight: 700 }}>{firm.atty}</div>
              <div>{firm.firm}</div>
              <div style={{ color: '#555' }}>{firm.city}</div>
              <div style={{ color: '#555' }}>{firm.email}</div>
            </div>
            <div>
              <div style={P.label}>Debtor / Account</div>
              <div style={{ fontWeight: 700 }}>{cust?.name || 'Unknown customer'}</div>
              {cust?.cb_number && <div style={{ color: '#555' }}>Account CB-{cust.cb_number}</div>}
              {addr && <div style={{ color: '#555' }}>{addr}</div>}
              {cust?.phone && <div style={{ color: '#555' }}>📞 {cust.phone}</div>}
              {cust?.email && <div style={{ color: '#555' }}>✉️ {cust.email}</div>}
            </div>
          </div>

          {/* summary */}
          <div style={P.label}>Amount due</div>
          <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', alignItems: 'baseline', borderTop: '1px solid #eee', borderBottom: '1px solid #eee', padding: '12px 0' }}>
            <div><div style={{ fontSize: 24, fontWeight: 800 }}>{money(total)}</div><div style={{ fontSize: 10, color: '#888' }}>{invoices.length} open invoice{invoices.length === 1 ? '' : 's'}</div></div>
            <div style={{ fontSize: 12, color: '#444' }}>
              Oldest balance: <strong>{oldestDays != null ? `${oldestDays} days past invoice` : '—'}</strong>
              {oldestMs ? <span style={{ color: '#888' }}> (since {fmtDate(new Date(oldestMs).toISOString())})</span> : null}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', margin: '10px 0 4px', fontSize: 12 }}>
            <span>0–30: <strong>{money(aging.cur)}</strong></span>
            <span>31–60: <strong>{money(aging.d60)}</strong></span>
            <span>61–90: <strong>{money(aging.d90)}</strong></span>
            <span style={{ color: '#b00020' }}>90+: <strong>{money(aging.d90p)}</strong></span>
          </div>

          {/* invoice schedule */}
          <div style={P.label}>Schedule of unpaid invoices</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={P.th}>Invoice #</th><th style={P.th}>Date</th><th style={P.th}>Job site</th><th style={{ ...P.th, textAlign: 'right' }}>Days late</th><th style={{ ...P.th, textAlign: 'right' }}>Balance</th></tr></thead>
            <tbody>
              {!invoices.length && <tr><td style={P.td} colSpan={5}>No open invoices on this account.</td></tr>}
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td style={P.td}>#{i.invoice_number || '—'}</td>
                  <td style={P.td}>{i.invoice_date ? fmtDate(i.invoice_date) : '—'}</td>
                  <td style={P.td}>{i.city || '—'}</td>
                  <td style={{ ...P.td, ...P.num }}>{i.ms != null ? daysSince(i.ms) : '—'}</td>
                  <td style={{ ...P.td, ...P.num, fontWeight: 700 }}>{money(i.bal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td style={{ ...P.td, fontWeight: 800, borderTop: '2px solid #ccc' }} colSpan={4}>Total referred</td><td style={{ ...P.td, ...P.num, fontWeight: 800, borderTop: '2px solid #ccc' }}>{money(total)}</td></tr></tfoot>
          </table>

          {/* contact / collections history — the proof of good-faith attempts */}
          <div style={P.label}>Collections history (good-faith contact attempts)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={P.th}>Date</th><th style={P.th}>Method</th><th style={P.th}>By</th><th style={P.th}>Note</th></tr></thead>
            <tbody>
              {!contacts.length && <tr><td style={P.td} colSpan={4}>No contact logged in the system for this account.</td></tr>}
              {contacts.map((c, idx) => (
                <tr key={idx}>
                  <td style={P.td}>{fmtDate(c.created_at)}</td>
                  <td style={P.td}>{CH[c.channel] || c.channel}</td>
                  <td style={P.td}>{c.by_email ? c.by_email.split('@')[0] : '—'}</td>
                  <td style={P.td}>{c.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* statutory references */}
          <div style={P.label}>Kentucky statutory references (counsel to confirm applicability)</div>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12, color: '#444', lineHeight: 1.6 }}>
            <li><strong>KRS Chapter 376</strong> — Mechanics’ and materialmen’s liens. Lien for labor/materials furnished; statement of lien generally must be filed within <strong>six (6) months</strong> after the last item is furnished (KRS 376.080).</li>
            <li><strong>KRS 413.090</strong> — 15-year limitation on a written contract; <strong>KRS 413.120</strong> — 5-year limitation on an unwritten/oral contract.</li>
            <li>Pre-judgment interest and reasonable collection costs may be recoverable per the signed work order / terms.</li>
          </ul>

          <div style={{ marginTop: 22, paddingTop: 12, borderTop: '1px solid #eee', fontSize: 10.5, color: '#999' }}>
            Generated by the Clog Busterz Sheetz web app from live A/R + the collections log. Figures reflect open balances as of {today}.
            This packet is an internal referral summary, not legal advice; statutory windows and lien eligibility to be confirmed by counsel.
          </div>
        </div>
      </div>
    </div>
  );
}
