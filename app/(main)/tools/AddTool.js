'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addTool } from './actions';

const inp = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 13.5 };

export default function AddTool() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState(null);
  const submit = (form) => { setErr(null); start(async () => { const r = await addTool(form); if (r.ok) { setOpen(false); router.refresh(); } else setErr(r.msg); }); };

  if (!open) return <button onClick={() => setOpen(true)} className="btn" style={{ marginBottom: 4 }}>＋ Add a tool</button>;
  return (
    <form action={submit} className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8 }}>
      <input name="name" placeholder="Name — RIDGID SeeSnake" style={inp} required autoFocus />
      <input name="category" placeholder="Category — camera" style={inp} />
      <input name="serial" placeholder="Serial (optional)" style={inp} />
      <input name="identifier" placeholder="Asset tag / barcode" style={inp} />
      <input name="alias" placeholder="Nicknames — seesnake, camera, the eye (comma-separated)" style={{ ...inp, gridColumn: '1 / -1' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" type="submit" disabled={pending}>{pending ? '…' : 'Add'}</button>
        <button type="button" onClick={() => setOpen(false)} className="pill" style={{ cursor: 'pointer' }}>Cancel</button>
      </div>
      {err && <div style={{ color: 'var(--red)', fontSize: 12, gridColumn: '1/-1' }}>{err}</div>}
    </form>
  );
}
