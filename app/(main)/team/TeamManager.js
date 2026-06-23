'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addUser, setRole } from './actions';
import { roleMeta } from '@/lib/roles';

function suggestPassword() {
  // readable temp password Devin can hand off: Word + 4 digits + symbol
  const words = ['Plunger', 'Drain', 'Snake', 'Auger', 'Wrench', 'Flange', 'Sewer', 'Valve'];
  const w = words[Math.floor(Math.random() * words.length)];
  const n = Math.floor(1000 + Math.random() * 9000);
  return `${w}${n}!`;
}

const inputStyle = {
  background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)',
  borderRadius: 8, padding: '9px 11px', fontSize: 14, width: '100%',
};

export default function TeamManager({ roleOptions, users }) {
  const router = useRouter();
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState(suggestPassword());

  async function onAdd(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const fd = new FormData(e.currentTarget);
    const res = await addUser(fd);
    setMsg(res);
    setBusy(false);
    if (res?.ok) { e.currentTarget.reset(); setPw(suggestPassword()); router.refresh(); }
  }

  async function onRoleChange(id, role) {
    const fd = new FormData();
    fd.set('id', id); fd.set('role', role);
    const res = await setRole(fd);
    setMsg(res);
    router.refresh();
  }

  return (
    <>
      {/* ── Add a hire ── */}
      <div className="card card-amber">
        <div style={{ fontWeight: 800, marginBottom: 10 }}>➕ Add a hire</div>
        <form onSubmit={onAdd} style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <input name="name" placeholder="Full name" style={inputStyle} autoComplete="off" />
            <input name="email" type="email" placeholder="email@clogbusterzplumbing.com" style={inputStyle} autoComplete="off" required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <select name="role" defaultValue="" style={inputStyle} required>
              <option value="" disabled>Pick a position…</option>
              {roleOptions.map((r) => <option key={r.id} value={r.id}>{r.label} — {r.short}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 6 }}>
              <input name="password" value={pw} onChange={(e) => setPw(e.target.value)} style={inputStyle} aria-label="Temp password" />
              <button type="button" onClick={() => setPw(suggestPassword())} title="New password"
                style={{ ...inputStyle, width: 'auto', cursor: 'pointer', whiteSpace: 'nowrap' }}>🎲</button>
            </div>
          </div>
          <div>
            <button type="submit" className="btn" disabled={busy}>{busy ? 'Adding…' : 'Add login'}</button>
            <span className="muted" style={{ fontSize: 11, marginLeft: 10 }}>They sign in with the email + this temp password (they can change it later).</span>
          </div>
        </form>
        {msg && (
          <div style={{ marginTop: 10, fontSize: 13, color: msg.ok ? 'var(--green-bright)' : 'var(--red)' }}>{msg.msg}</div>
        )}
      </div>

      {/* ── Current logins ── */}
      <h3 style={{ margin: '22px 0 8px', fontSize: 12, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        Current logins ({users.length})
      </h3>
      {!users.length && <div className="card"><span className="muted">No logins yet — add your first hire above.</span></div>}
      {users.map((u) => {
        const meta = roleMeta(u.role);
        return (
          <div key={u.id} className="card" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name || u.email}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {u.email}{u.lastSignIn ? ` · last in ${u.lastSignIn}` : ' · never signed in'}
              </div>
            </div>
            <select defaultValue={u.role} onChange={(e) => onRoleChange(u.id, e.target.value)}
              style={{ ...inputStyle, width: 'auto', borderColor: meta.color }}>
              {roleOptions.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
        );
      })}
    </>
  );
}
