'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { previewImport, runImport } from '../actions';

const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const box = { width: '100%', minHeight: 200, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, fontFamily: 'var(--mono)', lineHeight: 1.5, resize: 'vertical' };

export default function ImportPanel() {
  const router = useRouter();
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, start] = useTransition();

  const doPreview = () => { setErr(null); setResult(null); start(async () => { const r = await previewImport(csv); if (r.ok) setPreview(r); else { setPreview(null); setErr(r.msg); } }); };
  const doImport = () => {
    if (!window.confirm(`Import ${preview.rows} invoices for ~${preview.customers} customers? New customers will be created.`)) return;
    setErr(null);
    start(async () => { const r = await runImport(csv); if (r.ok) { setResult(r); setPreview(null); router.refresh(); } else setErr(r.msg); });
  };

  return (
    <div className="card card-amber">
      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
        First row = headers. Recognized: <code>Customer</code>, <code>Invoice #</code>, <code>Invoice Date</code>, <code>Total Due / Balance</code>, plus optional <code>City</code>, <code>Phone</code>, <code>Email</code>, <code>Address</code>. Paste CSV (copy straight from a spreadsheet works).
      </div>
      <textarea value={csv} onChange={(e) => { setCsv(e.target.value); setPreview(null); }} placeholder={'Customer,Invoice #,Invoice Date,Total Due\nMaxwell Construction,i29174,2025-04-23,2775.00\n…'} style={box} />

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
        <button onClick={doPreview} disabled={busy || !csv.trim()} className="pill" style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--fg-1)', padding: '8px 14px' }}>{busy ? '…' : '👁️ Preview'}</button>
        {preview && <button onClick={doImport} disabled={busy} className="btn">{busy ? 'Importing…' : `⬆️ Import ${preview.rows} invoices`}</button>}
      </div>

      {err && <div className="notice" style={{ marginTop: 10, color: 'var(--red)', borderColor: 'var(--red)' }}>{err}</div>}

      {preview && (
        <div className="card" style={{ marginTop: 10, background: 'var(--surface-2)' }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Looks good — <strong>{preview.rows}</strong> invoices · <strong>{preview.customers}</strong> customers</div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
            Columns mapped: {Object.entries(preview.cols).filter(([, v]) => v).map(([k, v]) => `${k}=“${v}”`).join(' · ')}
          </div>
          <div style={{ marginTop: 8, fontSize: 12 }}>
            {preview.sample.map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
                <span>{s.customer}{s.invoice ? ` · #${s.invoice}` : ''}{s.date ? ` · ${s.date}` : ''}</span>
                <span style={{ fontWeight: 700 }}>{money(s.balance)}</span>
              </div>
            ))}
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>…first {preview.sample.length} shown. Review, then Import.</div>
          </div>
        </div>
      )}

      {result && (
        <div className="notice" style={{ marginTop: 10, color: 'var(--green)', borderColor: 'var(--green)' }}>
          ✅ Imported <strong>{result.invCreated}</strong> invoices · created <strong>{result.custCreated}</strong> new customers
          {result.skipped ? ` · skipped ${result.skipped} (dupes / no balance)` : ''}. <Link href="/past-due">See A/R →</Link>
        </div>
      )}
    </div>
  );
}
