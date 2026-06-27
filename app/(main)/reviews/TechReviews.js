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

  const avg = stats.count ? (stats.sum / stats.count).toFixed(2) : '—';
  // This-week breakdown (5★ vs 4★ vs lower) for the "this month/week" delta line.
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const wk = reviews.filter((r) => { try { return new Date(r.created_at).getTime() >= weekAgo; } catch { return false; } });
  const wkFive = wk.filter((r) => Number(r.rating) === 5).length;
  const wkFour = wk.filter((r) => Number(r.rating) === 4).length;
  // Lowest-rated still-standing review for the "1-star" stat card.
  const lowOne = reviews.filter((r) => Number(r.rating) <= 1 && r.dispute_status !== 'approved');

  const card = { background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' };
  const h4 = { margin: '0 0 8px', fontSize: 11, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 };
  const v = { fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 20, fontWeight: 800, color: 'var(--fg)' };
  const delta = { fontSize: 11, color: 'var(--green-bright)', fontWeight: 700 };
  const deltaNeg = { fontSize: 11, color: 'var(--red-bright)', fontWeight: 700 };

  return (
    <>
      <div className="muted" style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: -2, marginBottom: 12 }}>Live from Google · CB Review Watcher pushes new ones every hour</div>

      {/* stat header — mirrors the HTML .pay-grid / .pay-card */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div style={card}>
          <h4 style={h4}>Avg Rating</h4>
          <div style={v}>{avg} ⭐</div>
          <div style={delta}>{stats.count} review{stats.count === 1 ? '' : 's'}</div>
        </div>
        <div style={card}>
          <h4 style={h4}>This Week</h4>
          <div style={v}>{stats.week} new</div>
          <div style={delta}>{wkFive}× 5★ · {wkFour}× 4★</div>
        </div>
        <div style={card}>
          <h4 style={h4}>5★ All-Time</h4>
          <div style={v}>{stats.five}</div>
          <div style={delta}>climbing the Review Race</div>
        </div>
        <div style={card}>
          <h4 style={h4}>1-star standing</h4>
          <div style={v}>{lowOne.length}</div>
          <div style={lowOne.length ? deltaNeg : delta}>{lowOne.length ? `${lowOne[0].customer_name || 'Customer'} · ${fmt(lowOne[0].created_at)} ⚠` : 'all clear'}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        {reviewUrl && <button onClick={copyLink} className="btn">⭐ Ask for a review</button>}
        <Link href="/races" className="btn btn-ghost">🏁 Review Race</Link>
      </div>
      <p className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>Every 5★ feeds your race + bonuses. Got a Karen / not-your-fault 1★? Dispute it — a manager decides within 48 hrs and an approved one wipes from the race.</p>

      {/* my reviews — mirrors the HTML .review-card list */}
      {reviews.length === 0 ? (
        <div style={{ ...card, color: 'var(--fg-3)', fontSize: 13, textAlign: 'center', padding: '20px 16px', marginTop: 8 }}>
          No reviews logged for you yet. Ask happy customers for a 5★ — it’s the fastest way up the race.
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          {reviews.map((r) => {
            const low = r.rating <= 3;
            const wiped = r.dispute_status === 'approved';
            return (
              <div key={r.id} style={{ background: 'var(--surface-1)', border: `1px solid ${low ? 'var(--red)' : 'var(--border)'}`, borderRadius: 10, padding: '14px 16px', marginBottom: 8, opacity: wiped ? 0.6 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ color: low ? 'var(--red)' : 'var(--amber)', fontSize: 16, letterSpacing: 1 }}>{stars(r.rating)}</span>
                  {r.dispute_status && <span className="pill" style={{ fontSize: 9.5, marginLeft: 'auto', color: wiped ? 'var(--green)' : r.dispute_status === 'denied' ? 'var(--red)' : 'var(--amber)' }}>{r.dispute_status === 'pending' ? 'dispute pending' : wiped ? 'wiped from race' : 'dispute denied'}</span>}
                </div>
                <div style={{ fontWeight: 600, fontSize: 13, marginTop: 4 }}>
                  {r.customer_name || 'Customer'} <span style={{ fontSize: 10, color: 'var(--fg-3)', fontWeight: 400 }}>· {r.source || 'Google'} · {fmt(r.created_at)}</span>
                </div>
                {r.text && <div style={{ fontSize: 13, color: 'var(--fg-2)', marginTop: 6, fontStyle: 'italic', lineHeight: 1.5 }}>&ldquo;{r.text}&rdquo;</div>}
                {low && !r.disputed && (
                  openId === r.id ? (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this unfair? (Karen / not our fault / wrong tech)" style={{ flex: '1 1 180px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 7, padding: '7px 9px', fontSize: 12 }} />
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
