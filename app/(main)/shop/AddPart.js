'use client';

// Reid's "add a part" — name + SKU + the names the guys call it (aliases) + qty/bin/location. The aliases
// feed Hook's locator so "anyone got a [whatever they call it]" finds it. Mirrors the tool alias flow.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addPart } from './actions';

const inp = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };

export default function AddPart() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);

  const submit = (form) => { setMsg(null); start(async () => { const r = await addPart(form); setMsg(r); if (r.ok) { router.refresh(); } }); };

  if (!open) return <button onClick={() => setOpen(true)} className="btn btn-ghost" style={{ marginTop: 8 }}>＋ Add a part (with nicknames)</button>;

  return (
    <form action={submit} className="card card-amber" style={{ display: 'grid', gap: 8, marginTop: 8 }}>
      <div style={{ fontWeight: 800 }}>📦 Add a part</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8 }}>
        <input name="name" placeholder="Part name — Wax ring" style={inp} required autoFocus />
        <input name="sku" placeholder="SKU (optional)" style={inp} />
        <input name="qty" type="number" min="0" placeholder="Qty in shop" style={inp} />
        <input name="bin" placeholder="Bin — A4" style={inp} />
        <select name="location_id" style={inp} defaultValue="richmond"><option value="richmond">Richmond shop</option><option value="lexington">Lexington shop</option></select>
      </div>
      <input name="alias" placeholder="Nicknames the guys use — johnny ring, toilet seal, wax (comma-separated)" style={inp} />
      <div className="muted" style={{ fontSize: 11 }}>Aliases let a tech ask Hook for it by any name and get pointed to this bin.</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Add part'}</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Close</button>
      </div>
      {msg && <div style={{ fontSize: 12.5, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}
    </form>
  );
}
