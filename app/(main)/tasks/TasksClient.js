'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addTask, completeTask, reopenTask } from './actions';

const input = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14, fontFamily: 'inherit' };
const PRI = { high: 'var(--red)', normal: 'var(--fg-3)', low: 'var(--fg-3)' };
const overdue = (d) => d && new Date(d).getTime() < Date.now() - 86400000;
const fmtDue = (d) => { if (!d) return ''; try { return new Date(d + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' }); } catch { return d; } };

export default function TasksClient({ open, done }) {
  const router = useRouter();
  const formRef = useRef(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);

  const run = (fn) => { setMsg(null); start(async () => { const r = await fn(); if (r && !r.ok) setMsg(r.msg); else router.refresh(); }); };
  function onAdd(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setMsg(null);
    start(async () => { const r = await addTask(fd); if (r.ok) { formRef.current?.reset(); router.refresh(); } else setMsg(r.msg); });
  }

  const Row = ({ t, isDone }) => (
    <div className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', opacity: isDone ? 0.65 : 1, borderLeft: `3px solid ${t.priority === 'high' && !isDone ? 'var(--red)' : 'var(--border)'}` }}>
      <button onClick={() => run(() => (isDone ? reopenTask(t.id) : completeTask(t.id)))} disabled={pending} aria-label={isDone ? 'Reopen' : 'Complete'}
        style={{ marginTop: 2, width: 20, height: 20, borderRadius: 5, border: '1px solid var(--border-strong)', background: isDone ? 'var(--green)' : 'var(--surface-2)', color: '#fff', cursor: 'pointer', flexShrink: 0, fontSize: 12, lineHeight: 1 }}>{isDone ? '✓' : ''}</button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, textDecoration: isDone ? 'line-through' : 'none' }}>{t.title}</div>
        {t.detail && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{t.detail}</div>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          {t.assignee && <span className="muted" style={{ fontSize: 11 }}>👤 {t.assignee}</span>}
          {t.due_date && <span style={{ fontSize: 11, color: !isDone && overdue(t.due_date) ? 'var(--red)' : 'var(--fg-3)', fontWeight: !isDone && overdue(t.due_date) ? 700 : 400 }}>📅 {fmtDue(t.due_date)}</span>}
          {t.priority === 'high' && !isDone && <span className="pill pill-red" style={{ fontSize: 9.5 }}>HIGH</span>}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <form ref={formRef} onSubmit={onAdd} className="card card-amber" style={{ display: 'grid', gap: 8 }}>
        <input name="title" placeholder="New task…" style={input} required autoComplete="off" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
          <input name="assignee" placeholder="Assign to (optional)" style={input} autoComplete="off" />
          <input name="due" type="date" style={input} />
          <select name="priority" defaultValue="normal" style={input}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select>
          <button type="submit" className="btn" disabled={pending}>{pending ? '…' : 'Add'}</button>
        </div>
        {msg && <div style={{ fontSize: 12, color: 'var(--red)' }}>{msg}</div>}
      </form>

      <h3 style={{ fontSize: 12, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.5px', margin: '18px 0 8px' }}>Open · {open.length}</h3>
      <div style={{ display: 'grid', gap: 6 }}>
        {open.map((t) => <Row key={t.id} t={t} isDone={false} />)}
        {!open.length && <div className="card"><span className="muted">Nothing open. 🎉</span></div>}
      </div>

      {done.length > 0 && (
        <>
          <h3 style={{ fontSize: 12, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.5px', margin: '18px 0 8px' }}>Recently done</h3>
          <div style={{ display: 'grid', gap: 6 }}>{done.map((t) => <Row key={t.id} t={t} isDone />)}</div>
        </>
      )}
    </>
  );
}
