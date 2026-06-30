'use client';

// Owner Awards Manager — add / edit / deactivate awards + their value (the $ totals + XP points).
// The tech Races/Vegas screens read the ACTIVE rows from here.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createAward, updateAward, toggleAward } from './actions';

const KINDS = [['badge', 'Badge'], ['bounty', 'Bounty'], ['weekly', 'Weekly race'], ['recurring', 'Recurring']];
const input = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 13, width: '100%' };
const money = (c) => (c == null ? '' : '$' + (Number(c) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 }));
const lbl = { fontSize: 11, fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4, display: 'block' };
// ISO (UTC) → the "YYYY-MM-DDTHH:mm" a <input type=datetime-local> expects, in the owner's local tz.
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
// Days until an expiry — for the at-a-glance label in the saved-award row.
const daysLeft = (iso) => { if (!iso) return null; const ms = new Date(iso).getTime() - Date.now(); if (!Number.isFinite(ms)) return null; return ms <= 0 ? 'expired' : ms < 864e5 ? 'ends today' : `${Math.ceil(ms / 864e5)}d left`; };

function Fields({ a }) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 130px', gap: 8 }}>
        <input name="icon" defaultValue={a?.icon || '🏆'} placeholder="🏆" style={{ ...input, textAlign: 'center' }} />
        <input name="title" defaultValue={a?.title || ''} placeholder="Award name (e.g. Crown Bonus)" style={input} />
        <select name="kind" defaultValue={a?.kind || 'badge'} style={input}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px', gap: 8, marginTop: 8 }}>
        <input name="amount" type="number" step="1" defaultValue={a?.amount_cents != null ? a.amount_cents / 100 : ''} placeholder="$ value" style={input} />
        <input name="points" type="number" step="1" defaultValue={a?.points ?? ''} placeholder="XP points" style={input} />
        <input name="sort" type="number" defaultValue={a?.sort ?? 0} placeholder="sort" style={input} />
      </div>
      <input name="description" defaultValue={a?.description || ''} placeholder="How it's earned (shown to techs)" style={{ ...input, marginTop: 8 }} />
      <div style={{ marginTop: 8 }}>
        <label style={lbl}>⏳ Ends (optional — leave blank for no expiry)</label>
        <input name="expires_at" type="datetime-local" defaultValue={toLocalInput(a?.expires_at)} style={input} />
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>When this passes, the bounty auto-drops from the techs' chase list and shows a countdown until then.</div>
      </div>
    </>
  );
}

export default function AwardsManager({ awards }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);

  const run = (fn, after) => { setMsg(null); start(async () => { const r = await fn(); setMsg(r); if (r?.ok) { after && after(); router.refresh(); } }); };
  const onAdd = (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); run(() => createAward(fd), () => { setAdding(false); }); };
  const onEdit = (e, id) => { e.preventDefault(); const fd = new FormData(e.currentTarget); run(() => updateAward(id, fd), () => setEditing(null)); };

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="h1" style={{ margin: 0 }}>🏆 Awards &amp; Bounties</div>
        <button onClick={() => { setAdding((v) => !v); setEditing(null); }} className="btn" style={{ marginLeft: 'auto' }}>{adding ? 'Cancel' : '+ New award'}</button>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>Add, edit, or deactivate awards + set their value ($ and XP). Techs see the active ones on Races &amp; Vegas.</p>
      {msg && <div className={msg.ok ? 'card' : 'notice'} style={msg.ok ? { borderColor: 'var(--green)' } : undefined}><span style={{ color: msg.ok ? 'var(--green)' : 'var(--red)', fontWeight: 800 }}>{msg.ok ? 'Saved' : 'Error'}</span><span className="muted"> — {msg.msg}</span></div>}

      {adding && (
        <form onSubmit={onAdd} className="card card-amber" style={{ marginTop: 10 }}>
          <Fields a={null} />
          <button className="btn" type="submit" disabled={pending} style={{ marginTop: 10 }}>{pending ? 'Saving…' : 'Add award'}</button>
        </form>
      )}

      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {!awards.length && <div className="card"><span className="muted">No awards yet. Add your first — Crown bonus, weekly bounty, badge, etc.</span></div>}
        {awards.map((a) => editing === a.id ? (
          <form key={a.id} onSubmit={(e) => onEdit(e, a.id)} className="card" style={{ borderColor: 'var(--amber)' }}>
            <Fields a={a} />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn" type="submit" disabled={pending}>Save</button>
              <button type="button" className="pill" style={{ cursor: 'pointer' }} onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        ) : (
          <div key={a.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: a.active ? 1 : 0.55 }}>
            <span style={{ fontSize: 24 }}>{a.icon || '🏆'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{a.title} <span className="pill" style={{ fontSize: 10 }}>{a.kind}</span>{!a.active && <span className="pill pill-red" style={{ fontSize: 10, marginLeft: 4 }}>off</span>}{a.expires_at && <span className="pill" style={{ fontSize: 10, marginLeft: 4, color: daysLeft(a.expires_at) === 'expired' ? 'var(--red)' : 'var(--amber)' }}>⏳ {daysLeft(a.expires_at)}</span>}</div>
              <div className="muted" style={{ fontSize: 12 }}>{[money(a.amount_cents), a.points != null ? `${a.points} XP` : '', a.description].filter(Boolean).join(' · ')}</div>
            </div>
            <button onClick={() => { setEditing(a.id); setAdding(false); }} className="pill" style={{ cursor: 'pointer' }}>Edit</button>
            <button onClick={() => run(() => toggleAward(a.id, !a.active))} disabled={pending} className="pill" style={{ cursor: 'pointer', color: a.active ? 'var(--red)' : 'var(--green)', border: '1px solid var(--border-strong)' }}>{a.active ? 'Deactivate' : 'Activate'}</button>
          </div>
        ))}
      </div>
    </div>
  );
}
