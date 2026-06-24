'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { setLeadStatus, bookLead } from './actions';

const STATUS = { new: { label: 'New', color: 'var(--amber)' }, contacted: { label: 'Contacted', color: 'var(--info-text)' }, booked: { label: 'Booked', color: 'var(--green)' }, dead: { label: 'Dead', color: 'var(--fg-3)' } };
const fmt = (iso) => { try { return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };
const dial = (p) => String(p || '').replace(/[^\d+]/g, '');

export default function LeadsClient({ leads }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const run = (fn) => { setMsg(null); start(async () => { const r = await fn(); setMsg(r); if (r?.ok) router.refresh(); }); };

  if (!leads.length) return <div className="card"><span className="muted">No web leads yet — they land here as your site form posts them. (The intake endpoint ports next.)</span></div>;

  return (
    <>
      {msg && <div className="muted" style={{ fontSize: 12, marginBottom: 8, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}{msg.ok && msg.jobId ? <> · <Link href={`/job/${msg.jobId}`}>open job</Link></> : ''}</div>}
      <div style={{ display: 'grid', gap: 8 }}>
        {leads.map((l) => {
          const s = STATUS[l.status] || STATUS.new;
          const tel = dial(l.phone);
          return (
            <div key={l.id} className="card" style={{ borderLeft: `3px solid ${s.color}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{l.name || 'Web Lead'} <span className="pill" style={{ fontSize: 9.5, color: s.color }}>{s.label}</span></div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {l.service || 'Service request'}{l.address ? ` · ${l.address}` : ''}
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{[l.phone, l.email].filter(Boolean).join(' · ')}</div>
                  {l.message && <div style={{ fontSize: 12.5, marginTop: 4, fontStyle: 'italic' }}>“{l.message}”</div>}
                </div>
                <span className="muted" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{fmt(l.created_at)}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {tel && <a href={`tel:${tel}`} className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>📞 Call</a>}
                {l.status !== 'booked' && <button disabled={pending} onClick={() => run(() => bookLead(l.id))} className="pill" style={{ cursor: 'pointer', background: 'var(--amber)', color: '#1a1206', fontWeight: 800 }}>Book →</button>}
                {l.job_id && <Link href={`/job/${l.job_id}`} className="pill">Open job</Link>}
                {l.status !== 'contacted' && l.status !== 'booked' && <button disabled={pending} onClick={() => run(() => setLeadStatus(l.id, 'contacted'))} className="pill" style={{ cursor: 'pointer' }}>Contacted</button>}
                {l.status !== 'dead' && l.status !== 'booked' && <button disabled={pending} onClick={() => run(() => setLeadStatus(l.id, 'dead'))} className="pill" style={{ cursor: 'pointer', color: 'var(--fg-3)' }}>Dead</button>}
                {(l.status === 'dead' || l.status === 'contacted') && <button disabled={pending} onClick={() => run(() => setLeadStatus(l.id, 'new'))} className="pill" style={{ cursor: 'pointer' }}>Reopen</button>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
