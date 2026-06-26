'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createProject } from './actions';

const inp = { width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '10px 12px', fontSize: 14 };

export default function NewProject({ presetCustomerId, presetName }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState(null);

  const submit = (form) => { setErr(null); start(async () => { const r = await createProject(form); if (r.ok) { router.push(`/projects/${r.id}`); } else setErr(r.msg); }); };

  if (!open) return <button onClick={() => setOpen(true)} className="btn" style={{ marginTop: 12 }}>＋ New project</button>;
  return (
    <form action={submit} className="card card-amber" style={{ marginTop: 12, display: 'grid', gap: 8 }}>
      <div style={{ fontWeight: 800 }}>New project</div>
      <input name="name" defaultValue={presetName || ''} placeholder="Project name — e.g. Beatyville Manor" style={inp} autoFocus required />
      <input name="site_address" placeholder="Job site address" style={inp} />
      <input name="billing_address" placeholder="Payer billing address (if different)" style={inp} />
      <input type="hidden" name="customer_id" defaultValue={presetCustomerId || ''} />
      <label className="muted" style={{ fontSize: 11 }}>Target completion (optional)<input type="date" name="target_completion" style={{ ...inp, marginTop: 3 }} /></label>
      {err && <div style={{ color: 'var(--red)', fontSize: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create project →'}</button>
        <button type="button" onClick={() => setOpen(false)} style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)', color: 'var(--fg-2)', borderRadius: 8, padding: '0 14px', cursor: 'pointer' }}>Cancel</button>
      </div>
    </form>
  );
}
