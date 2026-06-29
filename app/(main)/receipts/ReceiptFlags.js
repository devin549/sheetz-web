'use client';

// 🚧 Receipt ↔ work-order flags. Accounting runs reconciliation; missing/mismatched receipts show here as a
// warning (1st per tech) or a Doc Fraud Fee (after). Resolve when fixed, or waive (no fee).
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { runReceiptReconciliation, resolveReceiptFlag } from './reconcileActions';

const money = (c) => '$' + (Number(c || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ReceiptFlags({ flags = [] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const run = () => { setMsg(null); start(async () => { const r = await runReceiptReconciliation(30); setMsg(r); if (r.ok) router.refresh(); }); };
  const resolve = (id, decision) => start(async () => { const r = await resolveReceiptFlag(id, decision); setMsg(r); if (r.ok) router.refresh(); });

  return (
    <div className="card" style={{ marginBottom: 12, borderLeft: `3px solid ${flags.length ? 'var(--red)' : 'var(--green)'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 800 }}>🚧 Work-order receipt flags</span>
        <span className="pill" style={{ color: flags.length ? 'var(--red)' : 'var(--green)' }}>{flags.length ? `${flags.length} open` : 'all clear'}</span>
        <button onClick={run} disabled={pending} className="pill" style={{ marginLeft: 'auto', cursor: 'pointer', border: '1px solid var(--border-strong)', fontWeight: 700 }}>{pending ? '…' : '🔄 Run reconciliation (30d)'}</button>
      </div>
      {msg && <div style={{ fontSize: 12, marginTop: 6, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}
      {!flags.length ? (
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Every job’s materials match a receipt. Run reconciliation to re-check the last 30 days.</div>
      ) : (
        <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
          {flags.map((f) => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <span className="pill" style={{ fontSize: 9.5, fontWeight: 800, color: f.level === 'fee' ? 'var(--red)' : 'var(--amber)', border: `1px solid ${f.level === 'fee' ? 'var(--red)' : 'var(--amber)'}` }}>{f.level === 'fee' ? '🛑 DOC FRAUD FEE' : '⚠️ WARNING'}</span>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{f.tech_name || 'Tech'}</span>
              <span className="muted" style={{ fontSize: 12 }}>job {f.job_number || '—'} · {f.kind === 'receipt_missing' ? 'no receipt on file' : 'receipt ≠ job cost'}{f.detail?.cost_cents ? ` · ${money(f.detail.cost_cents)} materials` : ''}{f.kind === 'receipt_mismatch' && f.detail?.receipt_cents != null ? ` vs ${money(f.detail.receipt_cents)} receipts` : ''}</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button onClick={() => resolve(f.id, 'resolved')} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--green)', border: '1px solid var(--border-strong)' }}>✓ Resolved</button>
                <button onClick={() => resolve(f.id, 'waived')} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--fg-3)', border: '1px solid var(--border-strong)' }}>Waive</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
