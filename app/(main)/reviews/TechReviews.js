'use client';

// Tech-side Reviews pane (matches the HTML iPad, not the office log): YOUR reviews + reputation, this
// week's count, and a 1★ dispute → manager review → wipe-from-race. "Ask for a review" hands the tech the
// Google link to show/text the customer themselves (no auto-text). Review Race lives on /races.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { disputeReview } from './actions';

const stars = (n) => '★'.repeat(Math.max(0, Math.min(5, n))) + '☆'.repeat(Math.max(0, 5 - n));
const fmt = (iso) => { try { return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }); } catch { return ''; } };

export default function TechReviews({ reviews = [], stats, reviewUrl = '' }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [openId, setOpenId] = useState(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState(null);

  const dispute = (id) => { if (!reason.trim()) { setMsg({ ok: false, msg: 'Add a quick reason first.' }); return; } start(async () => { const r = await disputeReview(id, reason); setMsg(r); if (r.ok) { setOpenId(null); setReason(''); router.refresh(); } }); };
  const copyLink = async () => { try { await navigator.clipboard.writeText(reviewUrl); setMsg({ ok: true, msg: 'Review link copied — show it to the customer or text it yourself.' }); } catch { setMsg({ ok: true, msg: reviewUrl }); } };

  const avg = stats.count ? (stats.sum / stats.count).toFixed(1) : '—';
  const avgColor = stats.count && stats.sum / stats.count >= 4.5 ? 'var(--green)' : stats.count && stats.sum / stats.count >= 4 ? 'var(--amber)' : 'var(--red)';

  return (
    <>
      {/* my reputation */}
      <div className="card" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', borderTop: '2px solid var(--amber)' }}>
        <div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>My average</div><div style={{ fontSize: 26, fontWeight: 800, color: avgColor }}>{avg}<span style={{ fontSize: 14 }}> ★</span></div></div>
        <div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>This week</div><div style={{ fontSize: 26, fontWeight: 800 }}>{stats.week}</div></div>
        <div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>5★ all-time</div><div style={{ fontSize: 26, fontWeight: 800, color: 'var(--green)' }}>{stats.five}</div></div>
        <div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>Total</div><div style={{ fontSize: 26, fontWeight: 800 }}>{stats.count}</div></div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {reviewUrl && <button onClick={copyLink} className="btn">⭐ Ask for a review</button>}
        <Link href="/races" className="btn btn-ghost">🏁 Review Race</Link>
      </div>
      <p className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>Every 5★ feeds your race + bonuses. Got a Karen / not-your-fault 1★? Dispute it — a manager decides within 48 hrs and an approved one wipes from the race.</p>

      {/* my reviews */}
      <div className="h2" style={{ marginTop: 16 }}>My reviews</div>
      {reviews.length === 0 ? (
        <div className="card muted" style={{ fontSize: 13.5 }}>No reviews logged for you yet. Ask happy customers for a 5★ — it’s the fastest way up the race.</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {reviews.map((r) => {
            const low = r.rating <= 3;
            return (
              <div key={r.id} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', border: `1px solid ${low ? 'var(--red)' : 'var(--border)'}`, opacity: r.dispute_status === 'approved' ? 0.6 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ color: low ? 'var(--red)' : 'var(--amber)', fontWeight: 800, letterSpacing: 1 }}>{stars(r.rating)}</span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{r.customer_name || 'Customer'}</span>
                  <span className="muted" style={{ fontSize: 11 }}>· {r.source || 'Google'} · {fmt(r.created_at)}</span>
                  {r.dispute_status && <span className="pill" style={{ fontSize: 9.5, marginLeft: 'auto', color: r.dispute_status === 'approved' ? 'var(--green)' : r.dispute_status === 'denied' ? 'var(--red)' : 'var(--amber)' }}>{r.dispute_status === 'pending' ? 'dispute pending' : r.dispute_status === 'approved' ? 'wiped from race' : 'dispute denied'}</span>}
                </div>
                {r.text && <div style={{ fontSize: 12.5, marginTop: 5 }}>{r.text}</div>}
                {low && !r.disputed && (
                  openId === r.id ? (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this unfair? (Karen / not our fault / wrong tech)" style={{ flex: '1 1 180px', background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 7, padding: '7px 9px', fontSize: 12 }} />
                      <button onClick={() => dispute(r.id)} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--amber)', border: '1px solid var(--amber)' }}>Send dispute</button>
                      <button onClick={() => { setOpenId(null); setReason(''); }} className="pill muted" style={{ cursor: 'pointer' }}>cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => { setOpenId(r.id); setReason(''); setMsg(null); }} className="pill" style={{ cursor: 'pointer', marginTop: 8, color: 'var(--red)', border: '1px solid var(--red)' }}>⚠ Dispute this</button>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
      {msg && <div style={{ fontSize: 12.5, marginTop: 8, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}
    </>
  );
}
