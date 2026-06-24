'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveGoal } from './actions';

const input = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', width: 120, textAlign: 'right' };

function GoalRow({ g }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [target, setTarget] = useState(g.target);
  const [saved, setSaved] = useState(false);
  const save = () => { const fd = new FormData(); fd.set('key', g.key); fd.set('target', target); start(async () => { const r = await saveGoal(fd); if (r.ok) { setSaved(true); router.refresh(); setTimeout(() => setSaved(false), 1500); } }); };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{g.label}</div>
        <div className="muted" style={{ fontSize: 11 }}>{g.assignee || '—'} · {g.unit === 'dollars' ? '$' : 'count'}</div>
      </div>
      <span className="muted" style={{ fontSize: 13 }}>{g.unit === 'dollars' ? '$' : ''}</span>
      <input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" style={input} />
      <button onClick={save} disabled={pending} className="pill" style={{ cursor: 'pointer', color: saved ? 'var(--green)' : undefined }}>{pending ? '…' : saved ? 'Saved ✓' : 'Save'}</button>
    </div>
  );
}

export default function SettingsClient({ goals }) {
  return (
    <div className="card">
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Office goals</div>
      {goals.map((g) => <GoalRow key={g.key} g={g} />)}
      {!goals.length && <span className="muted">No goals configured.</span>}
      <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>Booked / Avg-ticket / QA show live on the board now; Calls / Reviews / Same-day fill in once that tracking is wired.</p>
    </div>
  );
}
