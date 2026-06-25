'use client';

// Closeout questions — the per-job-type checklist the tech answers before the job can close.
// Config lives in job_closeout_questions; this just renders the questions for THIS job + saves answers.
// Renders nothing when there are no questions (gate stays open), so it's invisible until configured.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveCloseoutAnswers } from './actions';
import { ClipboardCheck, CircleCheck, CircleAlert } from 'lucide-react';

export default function JobForms({ jobId, forms, canAnswer }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const items = forms?.items || [];
  const [draft, setDraft] = useState(() => Object.fromEntries(items.map((q) => [q.key, q.value ?? ''])));
  if (forms?.available === false || !items.length) return null;

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const save = () => { setMsg(null); start(async () => { const r = await saveCloseoutAnswers(jobId, draft); setMsg(r); if (r?.ok) router.refresh(); }); };
  const ready = forms.ready;

  return (
    <div className="card" style={{ marginTop: 10, borderLeft: `3px solid ${ready ? 'var(--green)' : 'var(--amber)'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <ClipboardCheck size={18} style={{ color: ready ? 'var(--green)' : 'var(--amber)' }} />
        <div style={{ fontWeight: 800 }}>Closeout Questions</div>
        <span className="pill" style={{ marginLeft: 'auto', color: ready ? 'var(--green)' : 'var(--amber)' }}>{ready ? 'Complete' : `${forms.missing.length} to answer`}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((q) => {
          const val = draft[q.key] ?? '';
          const bad = !q.ok;
          return (
            <div key={q.key}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                {q.ok ? <CircleCheck size={14} style={{ color: 'var(--green)' }} /> : <CircleAlert size={14} style={{ color: 'var(--amber)' }} />}
                {q.prompt || q.key}{q.required ? <span style={{ color: 'var(--amber)' }}> *</span> : null}
                {q.must_be ? <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>(must be {q.must_be})</span> : null}
              </div>
              {q.type === 'yesno' ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  {['yes', 'no'].map((opt) => (
                    <button key={opt} type="button" disabled={!canAnswer} onClick={() => set(q.key, opt)}
                      style={{ flex: 1, padding: '10px', borderRadius: 9, fontWeight: 800, fontSize: 13, textTransform: 'capitalize', cursor: canAnswer ? 'pointer' : 'default',
                        border: '1px solid ' + (String(val).toLowerCase() === opt ? 'var(--amber)' : 'var(--border-strong)'),
                        background: String(val).toLowerCase() === opt ? 'var(--amber)' : 'var(--surface-2)', color: String(val).toLowerCase() === opt ? '#1a1206' : 'var(--fg-2)' }}>
                      {opt}
                    </button>
                  ))}
                </div>
              ) : (
                <input type={q.type === 'number' ? 'number' : 'text'} inputMode={q.type === 'number' ? 'decimal' : undefined}
                  value={val} disabled={!canAnswer} onChange={(e) => set(q.key, e.target.value)} placeholder={q.type === 'number' ? '0' : 'Type answer…'}
                  style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid ' + (bad ? 'var(--amber-dim)' : 'var(--border)'), color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14 }} />
              )}
            </div>
          );
        })}
      </div>

      {canAnswer && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <button onClick={save} disabled={pending} className="btn" style={{ opacity: pending ? 0.6 : 1 }}>{pending ? 'Saving…' : 'Save answers'}</button>
          {msg && <span style={{ fontSize: 12, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</span>}
        </div>
      )}
      {!ready && <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>These must be answered before the job can close.</div>}
    </div>
  );
}
