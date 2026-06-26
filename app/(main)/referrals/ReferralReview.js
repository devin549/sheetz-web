'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { setReferralStatus } from './actions';

const TYPE = { fb: { label: 'FloodBusterz', icon: '🌊', c: '#64b5f6' }, reline: { label: 'Reline', icon: '🔧', c: '#26a69a' } };
const STATUS = { new: { l: 'New', c: 'var(--amber)' }, reviewing: { l: 'Reviewing', c: '#64b5f6' }, approved: { l: 'Approved', c: 'var(--green)' }, sold: { l: 'Sold 🎉', c: 'var(--green)' }, declined: { l: 'Declined', c: 'var(--fg-3)' } };
const when = (s) => { try { return new Date(s).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };

export default function ReferralReview({ r }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const t = TYPE[r.ref_type] || TYPE.fb;
  const s = STATUS[r.status] || STATUS.new;
  const set = (status) => start(async () => { const res = await setReferralStatus(r.id, status); setMsg(res.msg); if (res.ok) router.refresh(); });

  return (
    <div className="card" style={{ borderLeft: `4px solid ${t.c}`, borderColor: r.urgent ? 'var(--red)' : 'var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 20 }}>{t.icon}</span>
        <span style={{ fontWeight: 800 }}>{t.label}</span>
        {r.urgent && <span className="pill" style={{ fontSize: 9.5, color: 'var(--red)', border: '1px solid var(--red)' }}>🚨 URGENT</span>}
        <span className="pill" style={{ fontSize: 9.5, color: s.c, marginLeft: 'auto' }}>{s.l}</span>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        {r.customer_name || 'Customer'}{r.job_id ? <> · <Link href={`/job/${r.job_id}`} style={{ color: 'var(--amber)' }}>job →</Link></> : ''} · from {r.tech_name || 'tech'} · {when(r.created_at)}
      </div>
      {r.note && <div style={{ fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>{r.note}</div>}
      {r.photos && r.photos.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {r.photos.map((u, i) => u && <a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8 }} /></a>)}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 11, flexWrap: 'wrap' }}>
        {r.status === 'new' && <button onClick={() => set('reviewing')} disabled={pending} className="pill" style={{ cursor: 'pointer', color: '#64b5f6' }}>👀 Reviewing</button>}
        {['new', 'reviewing'].includes(r.status) && <button onClick={() => set('approved')} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--green)' }}>✓ Approve scope</button>}
        {r.status !== 'sold' && <button onClick={() => set('sold')} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--green)', border: '1px solid var(--green)' }}>🎉 Sold</button>}
        {r.status !== 'declined' && <button onClick={() => set('declined')} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--fg-3)' }}>Decline</button>}
      </div>
      {r.reviewed_by && <div className="muted" style={{ fontSize: 10.5, marginTop: 7 }}>Last touched by {r.reviewed_by}{r.reviewed_at ? ` · ${when(r.reviewed_at)}` : ''}</div>}
      {msg && <div style={{ fontSize: 11, marginTop: 6, color: 'var(--green)' }}>{msg}</div>}
    </div>
  );
}
