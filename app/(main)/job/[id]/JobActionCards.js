'use client';

// HTML tech-iPad parity — ported card-for-card from tech_ipad_v3.html (the gold standard), same order,
// labels, emoji and colors: En route → Notify · Step away (Parts run/Lunch/Personal + Back-on-site) ·
// Roll over · Build Estimate. Markup → React, mock handlers → real Supabase actions.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { notifyEnRoute, stepAway, backOnSite, rollOverJob } from './actions';

const firstName = (n) => String(n || 'the customer').trim().split(/\s+/)[0] || 'the customer';

export default function JobActionCards({ jobId, jobNumber, customerName = '', jobType = '', status = '', canAct = true }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(null);
  const [confirmRoll, setConfirmRoll] = useState(false);
  const [away, setAway] = useState(null); // step-away active state: the reason label, or null
  const s = String(status || '').toLowerCase();
  const done = /done|complete|closed|cancel/.test(s);
  const enroute = /enroute|rolling/.test(s);
  const fn = firstName(customerName);

  const run = (key, fn2, after) => { setBusy(key); setMsg(null); start(async () => { const r = await fn2(); setBusy(null); setMsg(r); if (r?.ok) { after && after(); router.refresh(); } }); };

  const card = { borderRadius: 12, padding: '10px 12px', marginBottom: 0 };
  const chip = { padding: '7px 11px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: 'var(--surface-2)', border: '1px solid var(--amber-dim)', color: 'var(--amber)' };

  return (
    <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
      {canAct && !done && (
        <>
          {/* 🚐 EN ROUTE → Notify (HTML #enRouteCard) */}
          <div style={{ ...card, background: 'linear-gradient(135deg,#0d47a1 0%,#1565c0 100%)', border: '1px solid #64b5f6', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 24 }}>🚐</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{enroute ? `You're marked EN ROUTE to ${fn}` : `Heading to ${fn}?`}</div>
              <div style={{ fontSize: 11, color: '#bbdefb' }}>One tap pings the office to text {fn} your ETA — no bouncing back and forth.</div>
            </div>
            <button onClick={() => run('enroute', () => notifyEnRoute(jobId))} disabled={pending}
              style={{ flex: 'none', background: '#fff', color: '#0d47a1', border: 'none', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>{busy === 'enroute' ? '…' : 'Notify →'}</button>
          </div>

          {/* 🚶 STEP AWAY (HTML #stepAwayCard) — idle reasons + active "office notified · Back on site" */}
          <div style={{ ...card, background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
            {!away ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => run('help', () => stepAway(jobId, 'help'))} disabled={pending}
                  style={{ ...chip, color: 'var(--red)', borderColor: 'var(--red)' }}>{busy === 'help' ? '…' : '🆘 Need a hand'}</button>
                <span className="muted" style={{ fontSize: 11, color: 'var(--fg-2)', flex: 1, minWidth: 130 }}>Stepping away from this job? Tell the office why — it stays open till you tap Done.</span>
                {[['parts_run', 'Parts run', '🛒 Parts run'], ['lunch', 'Lunch', '🍔 Lunch'], ['personal', 'Personal', '🚶 Personal']].map(([k, label, txt]) => (
                  <button key={k} onClick={() => run(k, () => stepAway(jobId, k), () => setAway(label))} disabled={pending} style={chip}>{busy === k ? '…' : txt}</button>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 16 }}>🟡</span>
                <span style={{ fontSize: 12, color: 'var(--amber)', flex: 1, minWidth: 130, fontWeight: 700 }}>{away} · office notified · job still open</span>
                <button onClick={() => run('back', () => backOnSite(jobId), () => setAway(null))} disabled={pending}
                  style={{ background: 'var(--green)', border: 'none', color: '#06120b', padding: '7px 13px', borderRadius: 8, fontSize: 11, fontWeight: 800, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>{busy === 'back' ? '…' : '🔧 Back on site'}</button>
              </div>
            )}
          </div>

          {/* 🔁 ROLL OVER (HTML #rolloverCard) */}
          <div style={{ ...card, background: 'var(--surface-1)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16 }}>🔁</span>
            <span style={{ fontSize: 11, color: 'var(--fg-2)', flex: 1, minWidth: 130 }}>Can't finish today? Roll this job to another day — same job, parts &amp; history kept.</span>
            {!confirmRoll ? (
              <button onClick={() => setConfirmRoll(true)} disabled={pending} style={chip}>🔁 Roll Over</button>
            ) : (
              <span style={{ display: 'inline-flex', gap: 6 }}>
                <button onClick={() => { setConfirmRoll(false); run('roll', () => rollOverJob(jobId)); }} disabled={pending} style={{ ...chip, borderColor: 'var(--amber)' }}>{busy === 'roll' ? '…' : 'Confirm — move +1 day'}</button>
                <button onClick={() => setConfirmRoll(false)} style={{ ...chip, color: 'var(--fg-3)', borderColor: 'var(--border)' }}>Cancel</button>
              </span>
            )}
          </div>
        </>
      )}

      {/* 🛒 PRIMARY CTA — Build Estimate (HTML primary CTA, after the cards above) */}
      <Link href={`/job/${jobId}/pricebook`} style={{ width: '100%', boxSizing: 'border-box', background: 'linear-gradient(135deg,#4caf50 0%,#1b5e20 100%)', color: '#fff', border: 'none', padding: '18px 16px', borderRadius: 12, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 4px 12px rgba(76,175,80,0.3)' }}>
        <span style={{ fontSize: 24 }}>🛒</span>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Build Estimate for {fn}</div>
          <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.9 }}>Price Book opens{jobType ? ` with ${jobType.toLowerCase()} suggestions` : ' with job-smart suggestions'}</div>
        </div>
      </Link>

      {msg && <div style={{ fontSize: 12, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}
    </div>
  );
}
