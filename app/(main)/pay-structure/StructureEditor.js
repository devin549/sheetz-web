'use client';

// Owner editor for pay-structure constants (markup tiers, premium %, dispatch cap, threshold, default
// commission). Edit 'cb' or add an alternate, then point a tech's pay_profile.structure at it.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveStructure } from './actions';

const input = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 13, width: '100%' };
const F = ({ label, name, def, step = '0.1' }) => (
  <label style={{ fontSize: 11, color: 'var(--fg-3)' }}>{label}<input name={name} type="number" step={step} defaultValue={def} style={{ ...input, marginTop: 3 }} /></label>
);

function Form({ s, onDone }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const onSubmit = (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); setMsg(null); start(async () => { const r = await saveStructure(fd); setMsg(r); if (r?.ok) { onDone && onDone(); router.refresh(); } }); };
  return (
    <form onSubmit={onSubmit} className="card card-amber" style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8 }}>
        <label style={{ fontSize: 11, color: 'var(--fg-3)' }}>ID<input name="name" defaultValue={s?.name || ''} readOnly={!!s} placeholder="cb" style={{ ...input, marginTop: 3, opacity: s ? 0.7 : 1 }} /></label>
        <label style={{ fontSize: 11, color: 'var(--fg-3)' }}>Label<input name="label" defaultValue={s?.label || ''} placeholder="Clog Busterz" style={{ ...input, marginTop: 3 }} /></label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8 }}>
        <F label="Dispatch cap ($)" name="dispatch_cap" def={s ? (s.dispatch_fee_cap_cents / 100) : 125} step="1" />
        <F label="Material threshold ($)" name="threshold" def={s ? (s.material_threshold_cents / 100) : 399} step="1" />
        <F label="Markup ≤ threshold" name="markup_low" def={s?.markup_low ?? 2} />
        <F label="Markup > threshold" name="markup_high" def={s?.markup_high ?? 1.5} />
        <F label="Premium % ≤ threshold" name="premium_low" def={s?.premium_low_pct ?? 10} step="1" />
        <F label="Premium % > threshold" name="premium_high" def={s?.premium_high_pct ?? 5} step="1" />
        <F label="Default commission %" name="default_commission" def={s?.default_commission_pct ?? 0} step="1" />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save structure'}</button>
        {onDone && <button type="button" className="pill" style={{ cursor: 'pointer' }} onClick={onDone}>Cancel</button>}
        {msg && <span style={{ fontSize: 12, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</span>}
      </div>
    </form>
  );
}

export default function StructureEditor({ structures }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="h1" style={{ margin: 0 }}>💰 Pay Structures</div>
        <button onClick={() => setAdding((v) => !v)} className="btn" style={{ marginLeft: 'auto' }}>{adding ? 'Cancel' : '+ New structure'}</button>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>The Clog Busterz formula constants. Edit “cb”, or add an alternate and point a tech’s pay profile at it (on /payroll).</p>
      {adding && <div style={{ marginBottom: 12 }}><Form onDone={() => setAdding(false)} /></div>}
      <div style={{ display: 'grid', gap: 14 }}>
        {structures.map((s) => (
          <div key={s.name}>
            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>{s.label || s.name} <span className="pill" style={{ fontSize: 10 }}>{s.name}</span></div>
            <Form s={s} />
          </div>
        ))}
      </div>
    </div>
  );
}
