'use client';

// Owner: grant (or dock) a specific tech. Pick a tech + an award from the catalog (or type a manual
// title), set $ / XP (negative to dock), note. Vegas XP sums the points. Recent grants shown below.
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { grantToTech } from './actions';

const input = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 13, width: '100%' };
const money = (c) => (c == null ? '' : (c < 0 ? '-$' : '$') + Math.abs(Number(c) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 }));
const fmt = (iso) => { try { return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }); } catch { return ''; } };

export default function AwardGrant({ techs = [], awards = [], recent = [] }) {
  const router = useRouter();
  const formRef = useRef(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const [techId, setTechId] = useState('');

  const onSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const t = techs.find((x) => String(x.id) === fd.get('tech_id'));
    if (t) fd.set('tech_name', t.name);
    setMsg(null);
    start(async () => { const r = await grantToTech(fd); setMsg(r); if (r?.ok) { formRef.current?.reset(); setTechId(''); router.refresh(); } });
  };

  return (
    <div className="wrap" style={{ maxWidth: 760, paddingTop: 0 }}>
      <div className="h1" style={{ fontSize: 18 }}>🎁 Grant / adjust a tech</div>
      <p className="muted" style={{ fontSize: 12.5 }}>Credit or dock an individual tech. Use a negative $ or XP to dock. Points feed their Vegas XP.</p>
      <form ref={formRef} onSubmit={onSubmit} className="card card-amber" style={{ display: 'grid', gap: 8 }}>
        <select name="tech_id" value={techId} onChange={(e) => setTechId(e.target.value)} required style={input}>
          <option value="">— pick a tech —</option>
          {techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select name="award_id" defaultValue="" style={input}>
          <option value="">— catalog award (optional) —</option>
          {awards.map((a) => <option key={a.id} value={a.id}>{a.icon || '🏆'} {a.title}</option>)}
        </select>
        <input name="title" placeholder="…or a manual title (e.g. Spot bonus)" style={input} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <input name="amount" type="number" step="1" placeholder="$ (− to dock)" style={input} />
          <input name="points" type="number" step="1" placeholder="XP (− to dock)" style={input} />
        </div>
        <input name="note" placeholder="Note (why)" style={input} />
        <button className="btn" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Apply to tech'}</button>
        {msg && <div style={{ fontSize: 12, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}
      </form>

      {recent.length > 0 && (
        <div className="card" style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--amber-dim)' }}>Recent grants</div>
          {recent.map((g) => (
            <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{g.tech_name} · {g.title}</div><div className="muted" style={{ fontSize: 11 }}>{fmt(g.created_at)}{g.granted_by ? ` · ${g.granted_by}` : ''}{g.note ? ` · ${g.note}` : ''}</div></div>
              <span className="pill" style={{ fontSize: 11, color: (g.points < 0 || g.amount_cents < 0) ? 'var(--red)' : 'var(--green)' }}>{[money(g.amount_cents), g.points != null ? `${g.points} XP` : ''].filter(Boolean).join(' · ')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
