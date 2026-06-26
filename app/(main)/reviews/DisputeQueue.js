'use client';

// Manager dispute queue — techs disputed these low reviews (Karen / not-our-fault). Approve wipes it from
// the Review Race + restores Crown/Turd eligibility; deny lets it stand.
import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { resolveDispute } from './actions';

const stars = (n) => '★'.repeat(Math.max(0, Math.min(5, n)));
const fmt = (iso) => { try { return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }); } catch { return ''; } };

export default function DisputeQueue({ disputes = [] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  if (!disputes.length) return null;

  const decide = (id, approve) => start(async () => { const r = await resolveDispute(id, approve); if (r.ok) router.refresh(); else setMsg(r.msg); });

  return (
    <div className="card" style={{ borderLeft: '3px solid var(--amber)', marginBottom: 14 }}>
      <div style={{ fontWeight: 800 }}>⚠ Review disputes ({disputes.length})</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>A tech flagged these as unfair. Approve → wiped from the Review Race; deny → it stands.</div>
      <div style={{ display: 'grid', gap: 8 }}>
        {disputes.map((d) => (
          <div key={d.id} style={{ padding: '9px 11px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--red)', fontWeight: 800 }}>{stars(d.rating)}</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{d.customer_name || 'Customer'}</span>
              <span className="muted" style={{ fontSize: 11 }}>· {d.tech_name || 'tech'} · {fmt(d.created_at)}</span>
            </div>
            {d.text && <div style={{ fontSize: 12, marginTop: 4 }}>{d.text}</div>}
            <div style={{ fontSize: 12, marginTop: 5, color: 'var(--amber)' }}>💬 Dispute: “{d.dispute_reason}”{d.dispute_by ? ` — ${d.dispute_by}` : ''}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button onClick={() => decide(d.id, true)} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--green)', border: '1px solid var(--green)' }}>✓ Approve (wipe)</button>
              <button onClick={() => decide(d.id, false)} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--red)', border: '1px solid var(--red)' }}>✗ Deny (stands)</button>
            </div>
          </div>
        ))}
      </div>
      {msg && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{msg}</div>}
    </div>
  );
}
