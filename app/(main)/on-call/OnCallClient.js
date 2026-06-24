'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveOnCall, postOnCallNow } from './actions';
import { DAYS } from '@/lib/onCall';
import { Save, Send, Phone } from 'lucide-react';

const input = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 10px', fontSize: 14, fontFamily: 'inherit' };
const lbl = { fontSize: 11, fontWeight: 700, color: 'var(--fg-2)', minWidth: 150 };

export default function OnCallClient({ schedule, names, canEdit, weekday, tonight }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [posting, startPost] = useTransition();
  const [msg, setMsg] = useState(null);
  const s = schedule || {};

  function submit(e) { e.preventDefault(); const form = e.currentTarget; setMsg(null); start(async () => { const r = await saveOnCall(new FormData(form)); setMsg(r); if (r.ok) router.refresh(); }); }
  function postNow() { setMsg(null); startPost(async () => { const r = await postOnCallNow(); setMsg(r); }); }

  const rows = [...DAYS, { field: 'helper_week', label: 'Helper of the week' }, { field: 'supervisor', label: 'Supervisor of the week' }];

  return (
    <>
      {/* Tonight banner */}
      <div className="card card-amber" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Phone size={22} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <div>
          <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>{weekday} · on-call tonight (5pm)</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: tonight && tonight.person ? 'var(--fg-1)' : 'var(--fg-3)' }}>{(tonight && tonight.person) || 'Not set'}</div>
        </div>
      </div>

      <datalist id="oncall-names">{(names || []).map((n) => <option key={n} value={n} />)}</datalist>

      <form onSubmit={submit} className="card" style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontWeight: 800 }}>{canEdit ? 'Set this week’s rotation' : 'This week’s rotation'}</span>
          {canEdit && <input name="week_label" defaultValue={s.week_label || ''} placeholder="Week label (optional)" style={{ ...input, width: 200 }} />}
        </div>
        {rows.map((r) => (
          <label key={r.field} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={lbl}>{r.label}</span>
            {canEdit
              ? <input name={r.field} defaultValue={s[r.field] || ''} list="oncall-names" placeholder="name" style={{ ...input, flex: '1 1 160px', maxWidth: 260 }} autoComplete="off" />
              : <span style={{ fontSize: 14, fontWeight: 600 }}>{s[r.field] || '—'}</span>}
          </label>
        ))}
        {canEdit && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
            <button type="submit" className="btn" disabled={pending} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Save size={15} /> {pending ? 'Saving…' : 'Save schedule'}</button>
            <button type="button" onClick={postNow} disabled={posting} className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Send size={14} /> {posting ? 'Posting…' : 'Post tonight’s to #sheetz now'}</button>
            {msg && <span style={{ fontSize: 13, fontWeight: 700, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</span>}
          </div>
        )}
        {!canEdit && s.updated_at && <div className="muted" style={{ fontSize: 11 }}>Set by {s.set_by || 'office'}.</div>}
      </form>
    </>
  );
}
