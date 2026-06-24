'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addUser, setRole, setTechLink, setTechPosition, setTechPhone, setUserActive } from './actions';
import { roleMeta } from '@/lib/roles';
import { POSITIONS as POSITION_OPTS } from '@/lib/positions';

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

export default function TeamManager({ roleOptions, users, techs = [] }) {
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

  async function onTechChange(id, techId) {
    const fd = new FormData();
    fd.set('id', id); fd.set('techId', techId);
    const res = await setTechLink(fd);
    setMsg(res);
    router.refresh();
  }

  async function onPositionChange(id, position) {
    const fd = new FormData();
    fd.set('id', id); fd.set('position', position);
    const res = await setTechPosition(fd);
    setMsg(res);
    router.refresh();
  }

  async function onPhoneSave(id, phone) {
    const fd = new FormData();
    fd.set('id', id); fd.set('phone', phone);
    const res = await setTechPhone(fd);
    setMsg(res);
  }

  async function onActiveToggle(id, name, active) {
    if (!active && !window.confirm(`Deactivate ${name || 'this login'}? They lose access immediately. You can re-activate later.`)) return;
    const fd = new FormData();
    fd.set('id', id); fd.set('active', active ? 'true' : 'false');
    const res = await setUserActive(fd);
    setMsg(res);
    router.refresh();
  }

  // Field-roster filtering (so it isn't an endless scroll)
  const [rosterQ, setRosterQ] = useState('');
  const [posFilter, setPosFilter] = useState('all');
  const posCounts = techs.reduce((m, t) => { const p = t.position || 'tech'; m[p] = (m[p] || 0) + 1; return m; }, {});
  const fieldIds = new Set(POSITION_OPTS.filter((p) => p.field).map((p) => p.id));
  const shownTechs = techs.filter((t) => (posFilter === 'all' || (t.position || 'tech') === posFilter) && (!rosterQ.trim() || t.name.toLowerCase().includes(rosterQ.trim().toLowerCase())));

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
              <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name || u.email}{u.active === false && <span className="pill pill-red" style={{ marginLeft: 8, fontSize: 10 }}>deactivated</span>}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {u.email}{u.lastSignIn ? ` · last in ${u.lastSignIn}` : ' · never signed in'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', opacity: u.active === false ? 0.6 : 1 }}>
              <button type="button" onClick={() => onActiveToggle(u.id, u.name || u.email, u.active === false)}
                title={u.active === false ? 'Re-activate this login' : 'Deactivate — revoke access now'}
                style={{ ...inputStyle, width: 'auto', cursor: 'pointer', color: u.active === false ? 'var(--green)' : 'var(--red)', borderColor: u.active === false ? 'var(--green)' : 'var(--border)' }}>
                {u.active === false ? 'Re-activate' : 'Deactivate'}
              </button>
              {(u.role === 'tech' || u.role === 'helper') && (
                <select value={u.techId || ''} onChange={(e) => onTechChange(u.id, e.target.value)} title="Link to a tech row → they see only their jobs"
                  style={{ ...inputStyle, width: 'auto', maxWidth: 170, borderColor: u.techId ? 'var(--green)' : 'var(--border)' }}>
                  <option value="">— link to tech —</option>
                  {techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
              <select defaultValue={u.role} onChange={(e) => onRoleChange(u.id, e.target.value)}
                style={{ ...inputStyle, width: 'auto', borderColor: meta.color }}>
                {roleOptions.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
          </div>
        );
      })}

      {/* ── Field roster — who can take jobs ── */}
      {techs.length > 0 && (
        <>
          <h3 style={{ margin: '24px 0 4px', fontSize: 12, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Field roster ({techs.length})
          </h3>
          <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>Job title on the <strong>board</strong> — controls who shows in the Job Booking picker + as a board row. <strong>What each person can SEE</strong> (financials, growth) is their <strong>login role</strong> up under “Current logins,” not this.</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
            <input value={rosterQ} onChange={(e) => setRosterQ(e.target.value)} placeholder="Search name…" style={{ ...inputStyle, width: 170 }} />
            <button type="button" onClick={() => setPosFilter('all')} className="pill" style={{ cursor: 'pointer', fontWeight: posFilter === 'all' ? 800 : 600, background: posFilter === 'all' ? 'var(--amber)' : 'var(--surface-2)', color: posFilter === 'all' ? '#1a1206' : 'var(--fg-2)' }}>All {techs.length}</button>
            {POSITION_OPTS.filter((p) => posCounts[p.id]).map((p) => (
              <button type="button" key={p.id} onClick={() => setPosFilter(p.id)} className="pill" style={{ cursor: 'pointer', fontWeight: posFilter === p.id ? 800 : 600, background: posFilter === p.id ? 'var(--amber)' : 'var(--surface-2)', color: posFilter === p.id ? '#1a1206' : 'var(--fg-2)' }}>{p.label} {posCounts[p.id]}</button>
            ))}
          </div>
          {!shownTechs.length && <div className="muted" style={{ fontSize: 12, padding: '6px 2px' }}>No one matches.</div>}
          {shownTechs.map((t) => (
            <div key={t.id} className="card" style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center', padding: '10px 14px' }}>
              <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.name}
                {!fieldIds.has(t.position || 'tech') && <span className="pill" style={{ marginLeft: 8, fontSize: 10, color: t.position === 'terminated' ? 'var(--red)' : 'var(--fg-3)' }}>{t.position === 'terminated' ? 'terminated' : 'off the board'}</span>}
              </div>
              <input defaultValue={t.phone || ''} placeholder="cell #" onBlur={(e) => { if (e.target.value.trim() !== (t.phone || '')) onPhoneSave(t.id, e.target.value.trim()); }}
                title="Tech cell — for dispatch.me link + on-the-way texts" style={{ ...inputStyle, width: 130 }} />
              <select defaultValue={t.position || 'tech'} onChange={(e) => onPositionChange(t.id, e.target.value)}
                style={{ ...inputStyle, width: 'auto', borderColor: t.position === 'office' ? 'var(--border)' : 'var(--amber)' }}>
                {POSITION_OPTS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
          ))}
        </>
      )}
    </>
  );
}
