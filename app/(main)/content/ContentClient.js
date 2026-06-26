'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { generateIdeas, draftIdea, setIdeaStatus, saveDraft } from './actions';

const STATUS = { idea: ['Ideas', 'var(--amber)'], drafted: ['Drafted', 'var(--blue)'], published: ['Published 🎉', 'var(--green)'], dismissed: ['Dismissed', 'var(--fg-3)'] };

export default function ContentClient({ ideas = [], aiReady, disabled }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const [open, setOpen] = useState(null);   // idea id whose draft is shown
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(null); // idea id being edited
  const [editText, setEditText] = useState('');

  const gen = () => start(async () => { setMsg('🤖 Reading your rank gaps + writing ideas…'); const r = await generateIdeas(); setMsg(r.msg); router.refresh(); });
  const draft = (id) => start(async () => { setMsg('✍️ Drafting…'); const r = await draftIdea(id); setMsg(r.msg); if (r.ok) setOpen(id); router.refresh(); });
  const mark = (id, status) => start(async () => { const r = await setIdeaStatus(id, status); setMsg(r.msg); router.refresh(); });
  const copy = (text) => { try { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (_) {} };
  const startEdit = (it) => { setEditing(it.id); setEditText(it.draft || ''); setOpen(it.id); };
  const save = (id) => start(async () => { const r = await saveDraft(id, editText); setMsg(r.msg); if (r.ok) setEditing(null); router.refresh(); });

  const byStatus = {}; Object.keys(STATUS).forEach((k) => { byStatus[k] = ideas.filter((i) => i.status === k); });

  return (
    <div style={{ marginTop: 12 }}>
      <button onClick={gen} disabled={pending || disabled || !aiReady} className="btn" style={{ padding: '11px 16px' }}>🤖 Generate ideas from rank gaps</button>
      {!aiReady && <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>Add an ANTHROPIC_KEY_* in Vercel to enable AI generation.</div>}
      {msg && <div style={{ fontSize: 12.5, margin: '8px 2px', color: 'var(--fg-2)' }}>{msg}</div>}

      {ideas.length === 0 && <div className="card" style={{ marginTop: 8 }}><span className="muted">No ideas yet — tap Generate. It reads where you don’t rank and recommends blogs to win those towns.</span></div>}

      {['idea', 'drafted', 'published', 'dismissed'].map((k) => byStatus[k].length > 0 && (
        <div key={k} style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 12.5, color: STATUS[k][1], marginBottom: 6 }}>{STATUS[k][0]} · {byStatus[k].length}</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {byStatus[k].map((it) => (
              <div key={it.id} className="card">
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontSize: 14, flex: 1, minWidth: 0 }}>{it.title}</span>
                  {it.target_town && <span className="pill" style={{ fontSize: 9.5, color: 'var(--amber)' }}>📍 {it.target_town}</span>}
                  {it.target_keyword && <span className="pill" style={{ fontSize: 9.5 }}>{it.target_keyword}</span>}
                </div>
                {it.rationale && <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>{it.rationale}</div>}

                <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap', alignItems: 'center' }}>
                  {!it.draft
                    ? <button onClick={() => draft(it.id)} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}>✍️ Draft it</button>
                    : <button onClick={() => setOpen(open === it.id ? null : it.id)} className="pill" style={{ cursor: 'pointer', color: 'var(--blue)' }}>{open === it.id ? 'Hide draft' : '📄 View draft'}</button>}
                  {it.draft && <button onClick={() => startEdit(it)} className="pill" style={{ cursor: 'pointer', color: 'var(--amber)' }}>✏️ Edit</button>}
                  {it.draft && <button onClick={() => copy(it.draft)} className="pill" style={{ cursor: 'pointer' }}>{copied ? '✓ Copied' : '📋 Copy'}</button>}
                  {it.draft && <button onClick={() => draft(it.id)} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--fg-3)' }}>🔄 Rewrite</button>}
                  {it.status !== 'published' && <button onClick={() => mark(it.id, 'published')} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--green)', border: '1px solid var(--green)' }}>✓ Approve &amp; publish</button>}
                  {it.status !== 'dismissed' && <button onClick={() => mark(it.id, 'dismissed')} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--fg-3)' }}>✕</button>}
                </div>

                {editing === it.id ? (
                  <div style={{ marginTop: 10 }}>
                    <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={16} style={{ width: '100%', boxSizing: 'border-box', fontSize: 12.5, lineHeight: 1.55, background: 'var(--surface-2)', border: '1px solid var(--amber)', borderRadius: 10, padding: 12, color: 'var(--fg-1)', fontFamily: 'inherit' }} />
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <button onClick={() => save(it.id)} disabled={pending} className="btn" style={{ padding: '7px 14px' }}>💾 Save changes</button>
                      <button onClick={() => setEditing(null)} className="pill" style={{ cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </div>
                ) : open === it.id && it.draft ? (
                  <pre style={{ marginTop: 10, whiteSpace: 'pre-wrap', fontSize: 12.5, lineHeight: 1.55, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, fontFamily: 'inherit', maxHeight: 380, overflowY: 'auto' }}>{it.draft}</pre>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
