'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { completePromise } from './actions';
import { Check, Clock } from 'lucide-react';

const dt = (s) => { try { return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return ''; } };
const todayStr = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; };

export default function PromisesClient({ rows }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [overdueOnly, setOverdueOnly] = useState(false);
  const today = todayStr();

  const complete = (id) => start(async () => { await completePromise(id); router.refresh(); });

  const overdue = rows.filter((r) => r.due_date && r.due_date < today).length;
  const shown = useMemo(() => rows.filter((r) => !overdueOnly || (r.due_date && r.due_date < today)), [rows, overdueOnly, today]);

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, margin: '4px 0 14px' }}>
        {[
          { k: 'Open', v: String(rows.length), sub: 'follow-ups + promises' },
          { k: 'Overdue', v: String(overdue), sub: 'past due date', color: overdue ? 'var(--red)' : 'var(--green)' },
        ].map((c) => (
          <div key={c.k} className="card" style={{ padding: '12px 14px' }}>
            <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>{c.k}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: c.color || 'var(--amber)', marginTop: 2 }}>{c.v}</div>
            <div className="muted" style={{ fontSize: 11 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 10 }}>
        <button type="button" onClick={() => setOverdueOnly((v) => !v)} className="pill" style={{ cursor: 'pointer', fontWeight: overdueOnly ? 800 : 600, background: overdueOnly ? 'var(--amber)' : 'var(--surface-2)', color: overdueOnly ? '#1a1206' : 'var(--fg-2)' }}>Overdue only {overdue}</button>
      </div>

      {!shown.length && <div className="card"><span className="muted">{rows.length ? 'Nothing overdue 🎉' : 'No open promises — set follow-ups from a customer account.'}</span></div>}
      <div style={{ display: 'grid', gap: 6 }}>
        {shown.map((r) => {
          const od = r.due_date && r.due_date < today;
          return (
            <div key={r.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', flexWrap: 'wrap', borderLeft: `3px solid ${od ? 'var(--red)' : 'var(--amber)'}`, opacity: pending ? 0.7 : 1 }}>
              <span className="pill" style={{ fontSize: 10, textTransform: 'capitalize' }}>{r.kind}</span>
              <span style={{ fontWeight: 700, fontSize: 13.5, flex: '0 0 auto' }}>{r.customer_name || 'Customer'}</span>
              <span style={{ flex: '1 1 160px', fontSize: 13 }}>{r.summary}</span>
              {r.due_date && <span style={{ fontSize: 11.5, fontWeight: 700, color: od ? 'var(--red)' : 'var(--amber)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Clock size={12} /> {od ? 'overdue ' : 'due '}{dt(r.due_date)}</span>}
              <span className="muted" style={{ fontSize: 11 }}>{r.owner || ''}</span>
              <button type="button" className="pill" onClick={() => complete(r.id)} disabled={pending} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--green)' }}><Check size={12} /> done</button>
            </div>
          );
        })}
      </div>
    </>
  );
}
