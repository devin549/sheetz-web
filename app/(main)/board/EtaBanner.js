'use client';

// Office side of the Running-Late relay. The tech reported a delay; here the OFFICE decides what
// the customer hears. Nothing auto-sends: "Send text" opens the office's SMS app with a prefilled
// draft (a human presses send), "Call" dials, "Acknowledge" just marks it handled.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { acknowledgeEta, notifyEta } from './actions';
import { fmtTime } from './boardTokens';
import { Clock, TriangleAlert, Phone, MessageSquare, Check } from 'lucide-react';

const dial = (raw) => { const d = String(raw || '').replace(/[^\d]/g, ''); if (d.length === 10) return '+1' + d; if (d.length === 11 && d[0] === '1') return '+' + d; return d ? '+' + d : ''; };

export default function EtaBanner({ reports, jobInfo, canContact }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [openId, setOpenId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [msg, setMsg] = useState(null);

  if (!reports || !reports.length) return null;

  const run = (fn) => { setMsg(null); start(async () => { const r = await fn(); setMsg(r); if (r?.ok) router.refresh(); }); };
  const defaultDraft = (r, info) => {
    const first = String(info.customer || 'there').split(/\s+/)[0];
    const tech = r.created_by_name || info.tech || 'your technician';
    const eta = r.new_eta ? fmtTime(r.new_eta) : `about ${r.minutes} min later`;
    return `Hi ${first}, ${tech} is running about ${r.minutes} minutes behind. New ETA around ${eta}. Thanks for your patience! — Clog Busterz`;
  };

  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
      {reports.map((r) => {
        const info = jobInfo[r.job_id] || {};
        const tech = r.created_by_name || info.tech || 'Tech';
        const open = openId === r.id;
        const draft = drafts[r.id] ?? defaultDraft(r, info);
        const tel = dial(info.phone);
        if (r.needs_help) {
          return (
            <div key={r.id} className="card" style={{ borderLeft: '3px solid var(--red)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <TriangleAlert size={18} style={{ color: 'var(--red)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 13 }}>{tech} needs office help — {info.customer || 'a job'}</div>
                {r.note && <div className="muted" style={{ fontSize: 12 }}>{r.note}</div>}
              </div>
              {tel && <a href={`tel:${tel}`} className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Phone size={13} /> Call</a>}
              {canContact && <button disabled={pending} onClick={() => run(() => acknowledgeEta(r.id))} className="pill" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={13} /> Got it</button>}
            </div>
          );
        }
        return (
          <div key={r.id} className="card" style={{ borderLeft: '3px solid var(--amber)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Clock size={18} style={{ color: 'var(--amber)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 13 }}>{tech} reported +{r.minutes} min on {info.customer || 'a job'}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>{fmtTime(r.created_at)}{r.new_eta ? ` · new ETA ≈ ${fmtTime(r.new_eta)}` : ''}{r.note ? ` · “${r.note}”` : ''}</div>
              </div>
              {canContact && <button onClick={() => setOpenId(open ? null : r.id)} className="pill" style={{ cursor: 'pointer' }}>{open ? 'Hide' : 'Notify customer'}</button>}
              {canContact && <button disabled={pending} onClick={() => run(() => acknowledgeEta(r.id))} className="pill" style={{ cursor: 'pointer' }}>Dismiss</button>}
            </div>

            {open && canContact && (
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                <div className="muted" style={{ fontSize: 11 }}>Customer notice draft — review, then send. Nothing goes out until you do.</div>
                <textarea value={draft} onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))} rows={3}
                  style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg-1)', fontSize: 13, resize: 'vertical' }} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {tel && <a href={`tel:${tel}`} className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}><Phone size={14} /> Call</a>}
                  {tel ? (
                    <a href={`sms:${tel}?&body=${encodeURIComponent(draft)}`} onClick={() => run(() => notifyEta(r.id))} className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '9px 14px', fontWeight: 800 }}><MessageSquare size={14} /> Send text</a>
                  ) : <span className="muted" style={{ fontSize: 11, alignSelf: 'center' }}>No phone on file — call from the customer record.</span>}
                  <button disabled={pending} onClick={() => run(() => notifyEta(r.id))} className="pill" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Check size={14} /> Mark notified</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {msg && <div className="muted" style={{ fontSize: 11, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}
    </div>
  );
}
