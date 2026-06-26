'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addAlias, requestTool, setHolder } from './actions';
import { logToolEvent, uploadToolPhoto } from './ledgerActions';
import InAppCamera from '../job/[id]/InAppCamera';

const STATUS = { on_van: { c: 'var(--green)', l: 'On a van' }, shop: { c: 'var(--amber)', l: 'In the shop' }, lost: { c: 'var(--red)', l: 'Lost' }, assigned: { c: 'var(--blue)', l: 'Assigned' } };

export default function ToolCard({ tool, isMgr }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [alias, setAlias] = useState('');
  const [msg, setMsg] = useState(null);
  const [holderEdit, setHolderEdit] = useState(false);
  const [holder, setHolderV] = useState(tool.assigned_to || '');
  const [logOpen, setLogOpen] = useState(false);
  const [cost, setCost] = useState('');
  const [note, setNote] = useState('');
  const [photoPath, setPhotoPath] = useState(null); // condition photo for the next event
  const [cam, setCam] = useState(false);
  const st = STATUS[tool.status] || { c: 'var(--fg-3)', l: tool.status || '—' };

  const teach = () => { if (!alias.trim()) return; start(async () => { const r = await addAlias(tool.id, alias); setMsg(r.msg); if (r.ok) { setAlias(''); router.refresh(); } }); };
  const request = () => start(async () => { const r = await requestTool(tool.id, tool.name, tool.assigned_to); setMsg(r.msg); });
  const reassign = (status) => start(async () => { const r = await setHolder(tool.id, holder, status); setMsg(r.ok ? 'Updated.' : r.msg); if (r.ok) { setHolderEdit(false); router.refresh(); } });
  // Log a lifecycle event (broke/lost/returned/repaired/retired) — stamps who had it + $ + the condition photo.
  const logEvt = (event) => start(async () => {
    const r = await logToolEvent(tool.id, event, { holderName: tool.assigned_to || '', costDollars: cost, note, conditionPhoto: photoPath });
    setMsg(r.msg); if (r.ok) { setCost(''); setNote(''); setPhotoPath(null); setLogOpen(false); router.refresh(); }
  });
  // Snap the damage / hand-off before logging — uploads, then attaches to whatever event you tap next.
  const onPhoto = (file) => { setCam(false); start(async () => { const fd = new FormData(); fd.set('toolId', tool.id); fd.set('photo', file); const r = await uploadToolPhoto(fd); if (r.ok) { setPhotoPath(r.path); setMsg('📷 Photo attached — now tap the event.'); } else setMsg(r.msg); }); };

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
        {isMgr && <button onClick={() => setLogOpen((v) => !v)} className="pill" style={{ cursor: 'pointer', color: 'var(--fg-3)' }}>🧾 log</button>}
      </div>

      {isMgr && logOpen && (
        <div style={{ marginTop: 8, padding: 10, background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <div className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>
            Log an event{tool.assigned_to ? <> for <strong style={{ color: 'var(--fg-2)' }}>{tool.assigned_to}</strong></> : ''} — kept forever on this tool's history.
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 7 }}>
            <input value={cost} onChange={(e) => setCost(e.target.value)} placeholder="$ cost / value" inputMode="decimal" style={{ ...inp, width: 110 }} />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="note (optional)" style={{ ...inp, flex: 1 }} />
            <button onClick={() => setCam(true)} disabled={pending} className="pill" style={{ cursor: 'pointer', color: photoPath ? 'var(--green)' : 'var(--fg-2)', whiteSpace: 'nowrap' }}>{photoPath ? '✓ photo' : '📷 photo'}</button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => logEvt('issued')} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--blue)' }}>📦 issued</button>
            <button onClick={() => logEvt('returned')} disabled={pending} className="pill" style={{ cursor: 'pointer' }}>↩️ returned</button>
            <button onClick={() => logEvt('broke')} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--red)' }}>💥 broke</button>
            <button onClick={() => logEvt('repaired')} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--green)' }}>🔧 repaired</button>
            <button onClick={() => logEvt('lost')} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--red)' }}>❓ lost</button>
            <button onClick={() => logEvt('retired')} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--fg-3)' }}>🪦 retired</button>
          </div>
        </div>
      )}

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
      {cam && <InAppCamera label={`${tool.name} — condition`} onCapture={onPhoto} onClose={() => setCam(false)} />}
    </div>
  );
}
