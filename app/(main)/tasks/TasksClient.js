'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addTask, completeTask, reopenTask, dismissTask, runChecksNow } from './actions';

const input = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14, fontFamily: 'inherit' };
const overdue = (d) => d && new Date(d).getTime() < Date.now() - 86400000;
const fmtDue = (d) => { if (!d) return ''; try { return new Date(d + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' }); } catch { return d; } };
// alert kind → emoji, for a quick visual scan of what fired.
const KIND_ICON = { no_status: '⏱', running_late: '🏃', ar_followup: '💸', oncall_unclaimed: '☎️', low_margin: '📉', geofence_leave: '📍', material_over: '🧾', missing_receipt: '🧾', photo_qa: '📸', missed_lead: '📞', net30_over: '🚧', paylink_unpaid: '💳' };
const PRI_COLOR = (p) => (p === 'high' ? 'var(--red)' : 'var(--border)');

export default function TasksClient({ open, done, alertsReady = false }) {
  const router = useRouter();
  const formRef = useRef(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);

  const run = (fn) => { setMsg(null); start(async () => { const r = await fn(); if (r && !r.ok) setMsg(r.msg); else { if (r && r.msg) setMsg(r.msg); router.refresh(); } }); };
  const alerts = open.filter((t) => t.source === 'system');
  const manual = open.filter((t) => t.source !== 'system');
  function onAdd(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setMsg(null);
    start(async () => { const r = await addTask(fd); if (r.ok) { formRef.current?.reset(); router.refresh(); } else setMsg(r.msg); });
  }

  const Row = ({ t, isDone }) => {
    const sys = t.source === 'system';
    return (
      <div className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', opacity: isDone ? 0.65 : 1, borderLeft: `3px solid ${!isDone ? PRI_COLOR(t.priority) : 'var(--border)'}` }}>
        <button onClick={() => run(() => (isDone ? reopenTask(t.id) : completeTask(t.id)))} disabled={pending} aria-label={isDone ? 'Reopen' : 'Resolve'}
          style={{ marginTop: 2, width: 20, height: 20, borderRadius: 5, border: '1px solid var(--border-strong)', background: isDone ? 'var(--green)' : 'var(--surface-2)', color: '#fff', cursor: 'pointer', flexShrink: 0, fontSize: 12, lineHeight: 1 }}>{isDone ? '✓' : ''}</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, textDecoration: isDone ? 'line-through' : 'none' }}>
            {sys && <span style={{ marginRight: 5 }}>{KIND_ICON[t.kind] || '🔔'}</span>}{t.title}
          </div>
          {t.detail && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{t.detail}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
            {sys && <span className="pill" style={{ fontSize: 9.5, color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}>AUTO</span>}
            {sys && t.entity === 'job' && t.entity_id && <a href={`/job/${t.entity_id}`} className="pill" style={{ fontSize: 9.5 }}>open job →</a>}
            {t.assignee && <span className="muted" style={{ fontSize: 11 }}>👤 {t.assignee}</span>}
            {t.due_date && <span style={{ fontSize: 11, color: !isDone && overdue(t.due_date) ? 'var(--red)' : 'var(--fg-3)', fontWeight: !isDone && overdue(t.due_date) ? 700 : 400 }}>📅 {fmtDue(t.due_date)}</span>}
            {t.seen_count > 1 && <span className="muted" style={{ fontSize: 10.5 }}>· seen {t.seen_count}×</span>}
            {t.priority === 'high' && !isDone && <span className="pill pill-red" style={{ fontSize: 9.5 }}>HIGH</span>}
            {sys && !isDone && <button onClick={() => run(() => dismissTask(t.id))} disabled={pending} className="pill" style={{ fontSize: 9.5, cursor: 'pointer', color: 'var(--fg-3)', marginLeft: 'auto' }}>dismiss</button>}
          </div>
        </div>
      </div>
    );
  };

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
        {msg && <div style={{ fontSize: 12, color: msg.includes('alert') || msg.includes('clear') ? 'var(--green)' : 'var(--red)' }}>{msg}</div>}
      </form>

      {/* ── SYSTEM ALERTS (the P4 trigger brain) ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '18px 0 8px' }}>
        <h3 style={{ fontSize: 12, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.5px', margin: 0, flex: 1 }}>🔔 Alerts · {alerts.length}</h3>
        {alertsReady && <button onClick={() => run(() => runChecksNow())} disabled={pending} className="btn btn-ghost" style={{ fontSize: 12 }}>{pending ? 'Checking…' : '⟳ Run checks now'}</button>}
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {alerts.map((t) => <Row key={t.id} t={t} isDone={false} />)}
        {!alerts.length && <div className="card"><span className="muted">{alertsReady ? 'No active alerts. 🎉' : 'Run migration 86 to enable system alerts.'}</span></div>}
      </div>

      <h3 style={{ fontSize: 12, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.5px', margin: '18px 0 8px' }}>Tasks · {manual.length}</h3>
      <div style={{ display: 'grid', gap: 6 }}>
        {manual.map((t) => <Row key={t.id} t={t} isDone={false} />)}
        {!manual.length && <div className="card"><span className="muted">Nothing open. 🎉</span></div>}
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
