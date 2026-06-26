'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addAlias, requestTool, setHolder } from './actions';

const STATUS = { on_van: { c: 'var(--green)', l: 'On a van' }, shop: { c: 'var(--amber)', l: 'In the shop' }, lost: { c: 'var(--red)', l: 'Lost' }, assigned: { c: 'var(--blue)', l: 'Assigned' } };

export default function ToolCard({ tool, isMgr }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [alias, setAlias] = useState('');
  const [msg, setMsg] = useState(null);
  const [holderEdit, setHolderEdit] = useState(false);
  const [holder, setHolderV] = useState(tool.assigned_to || '');
  const st = STATUS[tool.status] || { c: 'var(--fg-3)', l: tool.status || '—' };

  const teach = () => { if (!alias.trim()) return; start(async () => { const r = await addAlias(tool.id, alias); setMsg(r.msg); if (r.ok) { setAlias(''); router.refresh(); } }); };
  const request = () => start(async () => { const r = await requestTool(tool.id, tool.name, tool.assigned_to); setMsg(r.msg); });
  const reassign = (status) => start(async () => { const r = await setHolder(tool.id, holder, status); setMsg(r.ok ? 'Updated.' : r.msg); if (r.ok) { setHolderEdit(false); router.refresh(); } });

  const inp = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 7, padding: '7px 9px', fontSize: 12.5 };

  return (
    <div className="card card-amber">
      <div style={{ display: 'flex', gap: 12 }}>
        {tool.condition_photo_url && <img src={tool.condition_photo_url} alt="" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: 15 }}>{tool.name}</span>
            {tool.category && <span className="pill" style={{ fontSize: 10 }}>{tool.category}</span>}
            <span className="pill" style={{ fontSize: 10, color: st.c, border: `1px solid ${st.c}` }}>{st.l}</span>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
            {tool.assigned_to ? <>📍 <strong style={{ color: 'var(--fg-2)' }}>{tool.assigned_to}</strong> has it</> : '📦 unassigned'}
            {tool.serial ? ` · #${tool.serial}` : ''}{tool.mfg ? ` · ${tool.mfg}` : ''}
          </div>
          {tool.aliases.length > 0 && <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>{tool.aliases.map((a, i) => <span key={i} className="pill" style={{ fontSize: 9.5, color: 'var(--fg-3)' }}>“{a}”</span>)}</div>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
        {tool.assigned_to && <button onClick={request} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}>🙋 Ask for it</button>}
        <div style={{ display: 'flex', gap: 6, flex: '1 1 200px' }}>
          <input value={alias} onChange={(e) => setAlias(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') teach(); }} placeholder="teach a name — e.g. seesnake" style={{ ...inp, flex: 1 }} />
          <button onClick={teach} disabled={pending} className="pill" style={{ cursor: 'pointer' }}>＋ alias</button>
        </div>
        {isMgr && !holderEdit && <button onClick={() => setHolderEdit(true)} className="pill" style={{ cursor: 'pointer', color: 'var(--blue)' }}>reassign</button>}
      </div>

      {isMgr && holderEdit && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={holder} onChange={(e) => setHolderV(e.target.value)} placeholder="holder name (blank = unassign)" style={{ ...inp, flex: '1 1 160px' }} />
          <button onClick={() => reassign('assigned')} disabled={pending} className="btn" style={{ padding: '6px 10px' }}>Assign</button>
          <button onClick={() => reassign('on_van')} disabled={pending} className="pill" style={{ cursor: 'pointer' }}>on van</button>
          <button onClick={() => reassign('lost')} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--red)' }}>🚩 lost</button>
          <button onClick={() => setHolderEdit(false)} className="pill" style={{ cursor: 'pointer', color: 'var(--fg-3)' }}>✕</button>
        </div>
      )}
      {msg && <div style={{ fontSize: 11.5, marginTop: 6, color: 'var(--green)' }}>{msg}</div>}
    </div>
  );
}
