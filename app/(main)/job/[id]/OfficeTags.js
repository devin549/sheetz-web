'use client';

// 🏷 Office tags — dispatch types labels on a job (gate code, 2 dogs, proof needed, "water heater install").
// The tech sees them on the My Day card; the ✨-marked quick-adds ALSO attach a form (water heater → Water
// Heater Install form on the Forms tab). Office/dispatch edits; techs see read-only chips.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setOfficeTags } from './actions';
import { TAG_COLOR, officeTagPills } from '@/lib/jobTags';

// One-tap adds that trigger a form (mirrors OFFICE_TAG_FORMS) + common no-form labels.
const FORM_CHIPS = ['Water heater install', 'Gas line', 'Backflow', 'Sump / ejector', 'Repipe', 'Excavation', 'Water treatment'];
const COMMON_CHIPS = ['Proof needed', 'Prefers text', 'Gate code', '2 dogs friendly', 'No balance', 'Call ahead'];

export default function OfficeTags({ jobId, tags = [], canEdit = false }) {
  const router = useRouter();
  const [list, setList] = useState(Array.isArray(tags) ? tags.filter(Boolean) : []);
  const [draft, setDraft] = useState('');
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);

  if (!canEdit && !list.length) return null; // techs with no tags → nothing to show

  const pills = officeTagPills(list);
  const save = (next) => { setList(next); setMsg(null); start(async () => { const r = await setOfficeTags(jobId, next); setMsg(r); if (r?.ok) router.refresh(); }); };
  const add = (label) => { const v = String(label || '').trim(); if (!v || list.some((t) => t.toLowerCase() === v.toLowerCase()) || list.length >= 12) return; save([...list, v]); setDraft(''); };
  const remove = (label) => save(list.filter((t) => t !== label));

  return (
    <div className="card" style={{ marginTop: 10, borderLeft: '3px solid var(--amber-dim)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 16 }}>🏷</span>
        <div style={{ fontWeight: 800 }}>Office tags <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>— the tech sees these on My Day{canEdit ? '; ✨ ones attach a form' : ''}</span></div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {pills.length === 0 && <span className="muted" style={{ fontSize: 12 }}>No tags yet.</span>}
        {pills.map((p) => { const c = TAG_COLOR[p.tone] || TAG_COLOR.blue; return (
          <span key={p.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 999, background: c.bg, color: c.fg, border: `1px solid ${c.bd}` }}>
            {p.label}
            {canEdit && <button onClick={() => remove(p.label)} disabled={pending} style={{ background: 'none', border: 'none', color: c.fg, cursor: 'pointer', fontWeight: 900, lineHeight: 1, padding: 0 }}>×</button>}
          </span>
        ); })}
      </div>

      {canEdit && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {FORM_CHIPS.map((c) => <button key={c} onClick={() => add(c)} disabled={pending} className="pill" style={{ cursor: 'pointer', fontSize: 10.5, color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}>✨ {c}</button>)}
            {COMMON_CHIPS.map((c) => <button key={c} onClick={() => add(c)} disabled={pending} className="pill" style={{ cursor: 'pointer', fontSize: 10.5 }}>＋ {c}</button>)}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(draft); } }}
              placeholder="Type a tag — e.g. gate code 4421" style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
            <button onClick={() => add(draft)} disabled={pending || !draft.trim()} className="btn" style={{ opacity: (pending || !draft.trim()) ? 0.6 : 1 }}>Add</button>
          </div>
          <div className="muted" style={{ fontSize: 10.5, marginTop: 6 }}>✨ tags attach a form to this job (Forms tab) + gate closeout. Up to 12 tags.</div>
        </div>
      )}
      {msg && <div style={{ fontSize: 11.5, marginTop: 8, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}
    </div>
  );
}
