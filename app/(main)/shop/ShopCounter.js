'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { issueToJob, markReturned } from './actions';
import { Plus, X, RotateCcw } from 'lucide-react';

const input = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 10px', fontSize: 14, fontFamily: 'inherit' };
const label = { fontSize: 10.5, fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 3 };
const money = (c) => '$' + (Math.round(c || 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
const dt = (s) => { try { return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return ''; } };

export default function ShopCounter({ recent = [], items = [] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('issue');
  const [msg, setMsg] = useState(null);

  function submit(e) {
    e.preventDefault();
    const form = e.currentTarget; const fd = new FormData(form);
    fd.set('kind', kind);
    setMsg(null);
    start(async () => { const r = await issueToJob(fd); setMsg(r); if (r.ok) { form.reset(); setKind('issue'); setOpen(false); router.refresh(); } });
  }
  const ret = (id) => start(async () => { const r = await markReturned(id); if (!r.ok) setMsg(r); router.refresh(); });

  const out = recent.filter((r) => r.status === 'out');
  const outValue = out.reduce((s, r) => s + (r.total_cost_cents || 0), 0);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '4px 0 12px' }}>
        <button type="button" className="btn" onClick={() => setOpen((o) => !o)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{open ? <X size={15} /> : <Plus size={15} />}{open ? 'Close' : 'Issue to a job'}</button>
        <span className="muted" style={{ fontSize: 12 }}>{out.length} out · {money(outValue)} on jobs</span>
        {msg && <span style={{ fontSize: 13, fontWeight: 700, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</span>}
      </div>

      {open && (
        <form onSubmit={submit} className="card card-amber" style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {[{ v: 'issue', l: 'Issue / material' }, { v: 'rental', l: 'Rental' }].map((k) => {
              const on = kind === k.v;
              return <button type="button" key={k.v} onClick={() => setKind(k.v)} className="pill" style={{ cursor: 'pointer', fontWeight: on ? 800 : 600, background: on ? 'var(--amber)' : 'var(--surface-2)', color: on ? '#1a1206' : 'var(--fg-2)' }}>{k.l}</button>;
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <div><span style={label}>Item *</span><input name="item_name" list="shop-items" placeholder="part / material" style={input} required autoComplete="off" /><datalist id="shop-items">{items.map((i) => <option key={i} value={i} />)}</datalist></div>
            <div><span style={label}>SKU</span><input name="sku" placeholder="optional" style={input} autoComplete="off" /></div>
            <div><span style={label}>JOB # *</span><input name="job_id" placeholder="cost hits this job" style={input} required autoComplete="off" /></div>
            <div><span style={label}>Customer</span><input name="customer" placeholder="optional" style={input} autoComplete="off" /></div>
          </div>
          {kind === 'issue' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
              <div><span style={label}>Qty</span><input name="qty" type="number" min="0" step="0.01" defaultValue="1" style={input} /></div>
              <div><span style={label}>Unit</span><input name="unit" defaultValue="ea" style={input} autoComplete="off" /></div>
              <div><span style={label}>Unit cost $</span><input name="unit_cost" type="number" min="0" step="0.01" placeholder="0" style={input} /></div>
              <div><span style={label}>Tech (optional)</span><input name="issued_to" placeholder="who took it" style={input} autoComplete="off" /></div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
              <div><span style={label}>Daily rate $</span><input name="rental_daily" type="number" min="0" step="0.01" placeholder="0" style={input} /></div>
              <div><span style={label}>Days</span><input name="rental_days" type="number" min="0" step="1" placeholder="0" style={input} /></div>
              <div><span style={label}>Tech (optional)</span><input name="issued_to" placeholder="who took it" style={input} autoComplete="off" /></div>
            </div>
          )}
          <div><span style={label}>Note</span><input name="note" placeholder="optional" style={input} autoComplete="off" /></div>
          <div><button type="submit" className="btn" disabled={pending} style={{ opacity: pending ? 0.6 : 1 }}>{pending ? 'Saving…' : 'Issue to job'}</button></div>
        </form>
      )}

      {recent.length > 0 && (
        <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
          {recent.map((r) => (
            <div key={r.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', flexWrap: 'wrap', opacity: r.status === 'returned' ? 0.55 : 1 }}>
              <span style={{ fontWeight: 700, fontSize: 13.5, flex: '1 1 150px' }}>{r.item_name}{r.kind === 'rental' && <span className="pill" style={{ marginLeft: 6, fontSize: 9 }}>rental</span>}</span>
              <span className="muted" style={{ fontSize: 12 }}>job #{r.job_id}{r.qty ? ` · ${r.qty} ${r.unit || ''}` : ''}</span>
              <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--amber)' }}>{money(r.total_cost_cents)}</span>
              <span className="muted" style={{ fontSize: 11 }}>{dt(r.created_at)}</span>
              {r.status === 'out' && r.kind === 'rental'
                ? <button type="button" className="pill" onClick={() => ret(r.id)} disabled={pending} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--green)' }}><RotateCcw size={12} /> returned</button>
                : (r.status === 'returned' ? <span className="pill" style={{ fontSize: 9, color: 'var(--green)' }}>returned</span> : null)}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
