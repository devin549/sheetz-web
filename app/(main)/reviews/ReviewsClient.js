'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createReview, markResponded } from './actions';
import { Plus, Star, AlertTriangle, Check, X } from 'lucide-react';

const input = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '10px 11px', fontSize: 14, fontFamily: 'inherit' };
const label = { fontSize: 11, fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 4 };
const SOURCES = ['Google', 'Facebook', 'Yelp', 'Other'];
const ratingColor = (r) => (r >= 4 ? 'var(--green)' : r === 3 ? 'var(--amber)' : 'var(--red)');
const dt = (s) => { try { return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return ''; } };

function Stars({ n, size = 13 }) {
  return <span style={{ display: 'inline-flex', gap: 1, color: ratingColor(n) }}>{[1, 2, 3, 4, 5].map((i) => <Star key={i} size={size} fill={i <= n ? 'currentColor' : 'none'} strokeWidth={1.5} />)}</span>;
}

export default function ReviewsClient({ rows, techs }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [source, setSource] = useState('Google');
  const [msg, setMsg] = useState(null);

  const stats = useMemo(() => {
    const now = new Date(); const ws = new Date(now); ws.setDate(now.getDate() - now.getDay()); ws.setHours(0, 0, 0, 0);
    const week = rows.filter((r) => new Date(r.created_at) >= ws).length;
    const avg = rows.length ? (rows.reduce((s, r) => s + (r.rating || 0), 0) / rows.length) : 0;
    const fives = rows.filter((r) => r.rating === 5).length;
    const recovery = rows.filter((r) => (r.rating || 0) <= 3 && !r.responded).length;
    return { week, avg, fives, recovery };
  }, [rows]);

  function submit(e) {
    e.preventDefault();
    const form = e.currentTarget; const fd = new FormData(form);
    fd.set('rating', String(rating)); fd.set('source', source);
    setMsg(null);
    start(async () => { const r = await createReview(fd); setMsg(r); if (r.ok) { form.reset(); setRating(5); setSource('Google'); setOpen(false); router.refresh(); } });
  }
  const respond = (id) => start(async () => { const r = await markResponded(id); if (!r.ok) setMsg(r); router.refresh(); });

  const recovery = rows.filter((r) => (r.rating || 0) <= 3 && !r.responded);
  const rest = rows.filter((r) => !((r.rating || 0) <= 3 && !r.responded));

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, margin: '4px 0 14px' }}>
        {[
          { k: 'This week', v: String(stats.week), sub: 'reviews logged' },
          { k: 'Avg rating', v: stats.avg ? stats.avg.toFixed(1) + '★' : '—', sub: `${rows.length} on file`, color: ratingColor(Math.round(stats.avg)) },
          { k: '5-star', v: String(stats.fives), sub: 'all-time' },
          { k: 'Needs recovery', v: String(stats.recovery), sub: '1–3★ unhandled', color: stats.recovery ? 'var(--red)' : 'var(--green)' },
        ].map((c) => (
          <div key={c.k} className="card" style={{ padding: '12px 14px' }}>
            <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>{c.k}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: c.color || 'var(--amber)', marginTop: 2 }}>{c.v}</div>
            <div className="muted" style={{ fontSize: 11 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <button type="button" className="btn" onClick={() => setOpen((o) => !o)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {open ? <X size={15} /> : <Plus size={15} />}{open ? 'Close' : 'Log a review'}
        </button>
        {msg && <span style={{ fontSize: 13, fontWeight: 700, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</span>}
      </div>

      {open && (
        <form onSubmit={submit} className="card card-amber" style={{ display: 'grid', gap: 14, marginBottom: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <div><span style={label}>Customer</span><input name="customer_name" placeholder="Customer name" style={input} autoComplete="off" /></div>
            <div><span style={label}>Tech (optional)</span>
              <input name="tech_name" list="rv-techs" placeholder="Tech" style={input} autoComplete="off" />
              <datalist id="rv-techs">{techs.map((t) => <option key={t} value={t} />)}</datalist>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <span style={label}>Rating</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <button type="button" key={i} onClick={() => setRating(i)} aria-label={`${i} star`} style={{ background: 'none', border: 0, cursor: 'pointer', color: i <= rating ? ratingColor(rating) : 'var(--fg-3)', padding: 0 }}>
                    <Star size={26} fill={i <= rating ? 'currentColor' : 'none'} strokeWidth={1.5} />
                  </button>
                ))}
              </div>
            </div>
            <div style={{ minWidth: 150 }}>
              <span style={label}>Source</span>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {SOURCES.map((s) => {
                  const on = source === s;
                  return <button type="button" key={s} onClick={() => setSource(s)} className="pill" style={{ cursor: 'pointer', fontSize: 12, fontWeight: on ? 800 : 600, background: on ? 'var(--amber)' : 'var(--surface-2)', color: on ? '#1a1206' : 'var(--fg-2)', border: '1px solid var(--border)' }}>{s}</button>;
                })}
              </div>
            </div>
          </div>
          <div><span style={label}>What they said (optional)</span><textarea name="text" rows={3} placeholder="Review text…" style={{ ...input, resize: 'vertical' }} /></div>
          <div><button type="submit" className="btn" disabled={pending} style={{ opacity: pending ? 0.6 : 1 }}>{pending ? 'Logging…' : 'Log review'}</button></div>
        </form>
      )}

      {!rows.length && <div className="card"><span className="muted">No reviews logged yet — add your first above.</span></div>}

      {recovery.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 12, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={14} /> Customer Recovery · {recovery.length}</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {recovery.map((r) => <ReviewRow key={r.id} r={r} onRespond={respond} pending={pending} recovery />)}
          </div>
        </div>
      )}

      {rest.length > 0 && (
        <div>
          <h3 style={{ fontSize: 12, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 8px' }}>Recent reviews</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {rest.map((r) => <ReviewRow key={r.id} r={r} onRespond={respond} pending={pending} />)}
          </div>
        </div>
      )}
    </>
  );
}

function ReviewRow({ r, onRespond, pending, recovery }) {
  return (
    <div className="card" style={{ padding: '10px 14px', borderLeft: `3px solid ${ratingColor(r.rating)}`, opacity: pending ? 0.7 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Stars n={r.rating} />
        <span style={{ fontWeight: 700 }}>{r.customer_name || 'Anonymous'}</span>
        <span className="muted" style={{ fontSize: 11.5 }}>{[r.source, r.tech_name, dt(r.created_at)].filter(Boolean).join(' · ')}</span>
        <span style={{ flex: 1 }} />
        {recovery
          ? <button type="button" className="pill" onClick={() => onRespond(r.id)} disabled={pending} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--green)' }}><Check size={12} /> Mark handled</button>
          : (r.rating <= 3 && r.responded ? <span className="pill" style={{ color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={12} /> handled</span> : null)}
      </div>
      {r.text && <div style={{ fontSize: 13, marginTop: 6, color: 'var(--fg-2)' }}>{r.text}</div>}
    </div>
  );
}
