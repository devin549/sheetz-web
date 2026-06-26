'use client';

import { useState } from 'react';
import { addKbEntry, toggleKbEntry, deleteKbEntry } from './actions';

const CATS = ['water heater', 'drain', 'sewer', 'code', 'disposal', 'faucet', 'general'];
const empty = { topic: '', category: 'general', tags: '', body: '', source_label: '', source_url: '' };

export default function BrainKbClient({ entries, needsMig }) {
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setBusy(true); setMsg(null);
    const r = await addKbEntry(form);
    setMsg({ ok: r.ok, text: r.msg });
    if (r.ok) setForm(empty);
    setBusy(false);
  };

  return (
    <div className="wrap" style={{ maxWidth: 860 }}>
      <div className="h1" style={{ marginBottom: 2 }}>🧠 Brain Knowledge</div>
      <div style={{ color: 'var(--mute)', fontSize: 14, marginBottom: 16 }}>
        Feed the Plumber's Brain real manufacturer guidance, common fixes, and Kentucky code notes. The website
        Brain grounds its answers in what you add here (and can name the source). Be accurate — customers see this.
      </div>

      {needsMig && (
        <div className="notice" style={{ marginBottom: 16 }}>
          Run <code>supabase/112_brain_kb.sql</code> in Supabase first, then refresh.
        </div>
      )}

      {/* Add entry */}
      <div style={{ border: '1px solid var(--line, #2a2a2a)', borderRadius: 10, padding: 16, marginBottom: 22 }}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Add knowledge</div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 10 }}>
          <input placeholder="Topic — e.g. Rheem relief valve dripping" value={form.topic} onChange={(e) => upd('topic', e.target.value)} style={inp} />
          <select value={form.category} onChange={(e) => upd('category', e.target.value)} style={inp}>
            {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <textarea placeholder="The knowledge / manual snippet / fix the Brain should use…" value={form.body} onChange={(e) => upd('body', e.target.value)} rows={4} style={{ ...inp, width: '100%', marginBottom: 10, resize: 'vertical' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <input placeholder="Tags (comma-separated) — relief valve, t&p, rheem" value={form.tags} onChange={(e) => upd('tags', e.target.value)} style={inp} />
          <input placeholder="Source label — e.g. Rheem Use & Care Manual" value={form.source_label} onChange={(e) => upd('source_label', e.target.value)} style={inp} />
        </div>
        <input placeholder="Source URL (optional)" value={form.source_url} onChange={(e) => upd('source_url', e.target.value)} style={{ ...inp, width: '100%', marginBottom: 10 }} />
        <button className="btn btn-primary" disabled={busy || !form.topic.trim() || !form.body.trim()} onClick={submit}>{busy ? 'Saving…' : 'Add to Brain'}</button>
        {msg && <span style={{ marginLeft: 12, color: msg.ok ? '#3fae6a' : '#d9534f', fontSize: 13 }}>{msg.text}</span>}
      </div>

      {/* List */}
      <div style={{ fontWeight: 800, marginBottom: 8 }}>{entries.length} entr{entries.length === 1 ? 'y' : 'ies'}</div>
      {entries.map((e) => <KbRow key={e.id} e={e} />)}
      {!entries.length && !needsMig && <div style={{ color: 'var(--mute)', fontSize: 14 }}>Nothing yet — add the first piece of knowledge above.</div>}
    </div>
  );
}

function KbRow({ e }) {
  const [active, setActive] = useState(e.active);
  const [gone, setGone] = useState(false);
  if (gone) return null;
  const toggle = async () => { const n = !active; setActive(n); await toggleKbEntry(e.id, n); };
  const del = async () => { if (!confirm('Delete this entry?')) return; setGone(true); await deleteKbEntry(e.id); };
  return (
    <div style={{ border: '1px solid var(--line, #2a2a2a)', borderRadius: 9, padding: 12, marginBottom: 10, opacity: active ? 1 : 0.55 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
        <div style={{ fontWeight: 700 }}>{e.topic} {e.category ? <span style={{ fontSize: 11, color: 'var(--mute)' }}>· {e.category}</span> : null}</div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={toggle} style={tinyBtn}>{active ? 'On' : 'Off'}</button>
          <button onClick={del} style={{ ...tinyBtn, color: '#d9534f' }}>Delete</button>
        </div>
      </div>
      <div style={{ fontSize: 13, color: 'var(--fg, #ddd)', margin: '6px 0' }}>{e.body}</div>
      <div style={{ fontSize: 11, color: 'var(--mute)' }}>
        {(e.tags || []).join(', ')}{e.source_label ? ` · Source: ${e.source_label}` : ''}{e.created_by_name ? ` · by ${e.created_by_name}` : ''}
      </div>
    </div>
  );
}

const inp = { background: 'var(--card, #1a1a1a)', color: 'var(--fg, #eee)', border: '1px solid var(--line, #333)', borderRadius: 7, padding: '9px 11px', fontSize: 14 };
const tinyBtn = { background: 'transparent', border: '1px solid var(--line, #333)', color: 'var(--fg, #ccc)', borderRadius: 6, padding: '3px 10px', fontSize: 12, cursor: 'pointer' };
