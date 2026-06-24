'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addTool, checkOutTool, checkInTool } from './actions';
import { Wrench, Plus, X } from 'lucide-react';

const input = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 10px', fontSize: 14, fontFamily: 'inherit' };
const label = { fontSize: 10.5, fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 3 };
const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString();

function ToolRow({ t, techs, onOut, onIn, pending }) {
  const [pick, setPick] = useState('');
  const out = !!t.assigned_to;
  const sub = [t.mfg, t.year, t.serial && `SN ${t.serial}`, t.value ? money(t.value) : null].filter(Boolean).join(' · ');
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 13px', flexWrap: 'wrap', borderLeft: `3px solid ${out ? 'var(--amber)' : 'var(--green)'}`, opacity: pending ? 0.7 : 1 }}>
      <div style={{ flex: '1 1 180px', minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}><Wrench size={13} style={{ color: 'var(--fg-3)' }} /> {t.name}</div>
        {sub && <div className="muted" style={{ fontSize: 11.5 }}>{sub}</div>}
      </div>
      {out ? (
        <>
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>{t.assigned_to}</span>
          <button type="button" className="pill" onClick={() => onIn(t.id)} disabled={pending} style={{ cursor: 'pointer', color: 'var(--green)' }}>Check in</button>
        </>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          <select value={pick} onChange={(e) => setPick(e.target.value)} style={{ ...input, width: 'auto' }}>
            <option value="">— to tech —</option>{techs.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button type="button" className="btn" onClick={() => pick && onOut(t.id, pick)} disabled={pending || !pick} style={{ padding: '8px 12px', opacity: (pending || !pick) ? 0.6 : 1 }}>Check out</button>
        </div>
      )}
    </div>
  );
}

export default function ToolCheckoutClient({ tools, techs }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState(null);

  const onOut = (id, tech) => start(async () => { const r = await checkOutTool(id, tech); setMsg(r); router.refresh(); });
  const onIn = (id) => start(async () => { const r = await checkInTool(id); setMsg(r); router.refresh(); });
  function submit(e) {
    e.preventDefault(); const form = e.currentTarget;
    setMsg(null);
    start(async () => { const r = await addTool(new FormData(form)); setMsg(r); if (r.ok) { form.reset(); setOpen(false); router.refresh(); } });
  }

  const filtered = useMemo(() => tools.filter((t) => !q.trim() || `${t.name} ${t.assigned_to || ''} ${t.serial || ''}`.toLowerCase().includes(q.trim().toLowerCase())), [tools, q]);
  const outList = filtered.filter((t) => t.assigned_to);
  const inList = filtered.filter((t) => !t.assigned_to);
  const valueOut = tools.filter((t) => t.assigned_to).reduce((s, t) => s + (Number(t.value) || 0), 0);

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, margin: '4px 0 14px' }}>
        {[
          { k: 'Tools', v: String(tools.length), sub: 'tracked' },
          { k: 'Checked out', v: String(tools.filter((t) => t.assigned_to).length), sub: 'with techs', color: 'var(--amber)' },
          { k: 'In shop', v: String(tools.filter((t) => !t.assigned_to).length), sub: 'available' },
          { k: 'Value out', v: money(valueOut), sub: 'on the road' },
        ].map((c) => (
          <div key={c.k} className="card" style={{ padding: '11px 13px' }}>
            <div className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>{c.k}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: c.color || 'var(--amber)', marginTop: 2 }}>{c.v}</div>
            <div className="muted" style={{ fontSize: 11 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tool / tech / serial…" style={{ ...input, width: 240 }} />
        <button type="button" className="btn" onClick={() => setOpen((o) => !o)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{open ? <X size={15} /> : <Plus size={15} />}{open ? 'Close' : 'Add tool'}</button>
        {msg && <span style={{ fontSize: 13, fontWeight: 700, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</span>}
      </div>

      {open && (
        <form onSubmit={submit} className="card card-amber" style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <div><span style={label}>Tool *</span><input name="name" placeholder="e.g. K-60 sectional machine" style={input} required autoComplete="off" /></div>
            <div><span style={label}>Mfg</span><input name="mfg" placeholder="RIDGID…" style={input} autoComplete="off" /></div>
            <div><span style={label}>Serial</span><input name="serial" style={input} autoComplete="off" /></div>
            <div><span style={label}>Year</span><input name="year" type="number" style={input} /></div>
            <div><span style={label}>Value $</span><input name="value" type="number" min="0" step="1" placeholder="0" style={input} /></div>
          </div>
          <div><button type="submit" className="btn" disabled={pending}>Add tool</button></div>
        </form>
      )}

      {outList.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <h3 style={{ fontSize: 12, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 8px' }}>Checked out · {outList.length}</h3>
          <div style={{ display: 'grid', gap: 6 }}>{outList.map((t) => <ToolRow key={t.id} t={t} techs={techs} onOut={onOut} onIn={onIn} pending={pending} />)}</div>
        </div>
      )}
      <div>
        <h3 style={{ fontSize: 12, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 8px' }}>In shop · {inList.length}</h3>
        {!inList.length && <div className="muted" style={{ fontSize: 13 }}>Nothing in the shop{q ? ' matches' : ''}.</div>}
        <div style={{ display: 'grid', gap: 6 }}>{inList.map((t) => <ToolRow key={t.id} t={t} techs={techs} onOut={onOut} onIn={onIn} pending={pending} />)}</div>
      </div>
    </>
  );
}
