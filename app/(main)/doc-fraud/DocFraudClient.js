'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createCase, absolveCase, applyToPayroll } from './actions';

const money = (c) => '$' + (Number(c || 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 });
const input = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14, fontFamily: 'inherit', width: '100%' };
const fmt = (iso) => { try { return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }); } catch { return ''; } };

export default function DocFraudClient({ cases, candidates, techs, canApprove }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const formRef = useRef(null);
  const [f, setF] = useState({ techId: '', techName: '', jobId: '', photoId: '', claimed: '', fee: '', reason: '' });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const run = (fn) => { setMsg(null); start(async () => { const r = await fn(); setMsg(r); if (r?.ok) router.refresh(); }); };
  function onCreate(e) {
    e.preventDefault();
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => fd.set(k, v));
    const t = techs.find((x) => x.id === f.techId); if (t) fd.set('techName', t.name);
    setMsg(null);
    start(async () => { const r = await createCase(fd); setMsg(r); if (r.ok) { setF({ techId: '', techName: '', jobId: '', photoId: '', claimed: '', fee: '', reason: '' }); router.refresh(); } });
  }
  function openFrom(c) {
    setF({ techId: c.techId || '', techName: c.techName || '', jobId: c.jobId || '', photoId: c.photoId || '', claimed: c.amountCents ? (c.amountCents / 100).toString() : '', fee: '', reason: `No verified receipt — flagged${c.vendor ? ` (${c.vendor})` : ''}.` });
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const open = cases.filter((c) => c.status === 'open');
  const totals = useMemo(() => ({ openFee: open.reduce((s, c) => s + (c.fee_cents || 0), 0), appliedFee: cases.filter((c) => c.status === 'applied').reduce((s, c) => s + (c.fee_cents || 0), 0) }), [cases, open]);
  const STATUS = { open: { label: 'Open', color: 'var(--amber)' }, applied: { label: 'Fee applied', color: 'var(--red)' }, absolved: { label: 'Absolved', color: 'var(--green)' } };

  return (
    <>
      <div className="card" style={{ display: 'flex', gap: 22, flexWrap: 'wrap', borderTop: '2px solid var(--red)' }}>
        <div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>Open cases</div><div style={{ fontSize: 22, fontWeight: 800 }}>{open.length}</div></div>
        <div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>Open fees</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--amber)' }}>{money(totals.openFee)}</div></div>
        <div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>Applied (recovered)</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--red)' }}>{money(totals.appliedFee)}</div></div>
      </div>
      {msg && <div className="muted" style={{ fontSize: 12, margin: '8px 0', color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}

      {candidates.length > 0 && (
        <>
          <h3 style={{ fontSize: 12, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.5px', margin: '18px 0 8px' }}>Flagged receipts · {candidates.length}</h3>
          <div style={{ display: 'grid', gap: 6 }}>
            {candidates.map((c) => (
              <div key={c.photoId} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderLeft: '3px solid var(--red)' }}>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 13 }}>{c.techName || 'Tech'} · {c.vendor || 'flagged receipt'}{c.amountCents ? ` · ${money(c.amountCents)}` : ''}</div><div className="muted" style={{ fontSize: 11 }}>flagged on review</div></div>
                <button onClick={() => openFrom(c)} className="pill" style={{ cursor: 'pointer' }}>Open case</button>
              </div>
            ))}
          </div>
        </>
      )}

      <form ref={formRef} onSubmit={onCreate} className="card card-amber" style={{ display: 'grid', gap: 8, marginTop: 16 }}>
        <div style={{ fontWeight: 800 }}>New case</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
          <select value={f.techId} onChange={(e) => set('techId', e.target.value)} style={input} required><option value="">Tech…</option>{techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <input value={f.claimed} onChange={(e) => set('claimed', e.target.value)} placeholder="Claimed $ (stripped)" inputMode="decimal" style={input} />
          <input value={f.fee} onChange={(e) => set('fee', e.target.value)} placeholder="Fee $" inputMode="decimal" style={input} required />
        </div>
        <input value={f.reason} onChange={(e) => set('reason', e.target.value)} placeholder="Reason / note" style={input} />
        <div><button type="submit" className="btn" disabled={pending}>{pending ? '…' : 'Open case'}</button></div>
      </form>

      <h3 style={{ fontSize: 12, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.5px', margin: '18px 0 8px' }}>Cases</h3>
      <div style={{ display: 'grid', gap: 6 }}>
        {cases.map((c) => {
          const s = STATUS[c.status] || STATUS.open;
          return (
            <div key={c.id} className="card" style={{ borderLeft: `3px solid ${s.color}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{c.tech_name || 'Tech'} <span style={{ color: 'var(--red)', fontFamily: 'var(--mono)' }}>{money(c.fee_cents)} fee</span>{c.claimed_cents ? <span className="muted" style={{ fontSize: 11, fontWeight: 400 }}> · {money(c.claimed_cents)} claim stripped</span> : null}</div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{fmt(c.created_at)}{c.reason ? ` · ${c.reason}` : ''}{c.resolved_by ? ` · by ${c.resolved_by}` : ''}</div>
                </div>
                <span className="pill" style={{ fontSize: 10.5, color: s.color, alignSelf: 'flex-start' }}>{s.label}</span>
              </div>
              {c.status === 'open' && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  {canApprove && <button disabled={pending} onClick={() => run(() => applyToPayroll(c.id))} className="pill" style={{ cursor: 'pointer', background: 'rgba(239,83,80,.16)', color: 'var(--red)', fontWeight: 800 }}>Apply fee → payroll</button>}
                  <button disabled={pending} onClick={() => run(() => absolveCase(c.id))} className="pill" style={{ cursor: 'pointer', color: 'var(--green)' }}>Absolve</button>
                </div>
              )}
            </div>
          );
        })}
        {!cases.length && <div className="card"><span className="muted">No cases. Flagged receipts above become candidates; or open one manually.</span></div>}
      </div>
    </>
  );
}
