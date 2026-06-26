'use client';

// HTML tech-iPad parity: the in-job action cards — Build Estimate CTA · En route → Notify ·
// Need a hand / step away (Parts run · Lunch · Personal) · Roll over. Ported from tech_ipad_v3.html.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShoppingCart, Truck, HandHelping, CalendarClock } from 'lucide-react';
import { notifyEnRoute, stepAway, rollOverJob } from './actions';

const firstName = (n) => String(n || 'the customer').trim().split(/\s+/)[0] || 'the customer';

export default function JobActionCards({ jobId, jobNumber, customerName = '', jobType = '', status = '', canAct = true }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(null);
  const [confirmRoll, setConfirmRoll] = useState(false);
  const s = String(status || '').toLowerCase();
  const done = /done|complete|closed|cancel/.test(s);
  const enroute = /enroute|rolling/.test(s);
  const fn = firstName(customerName);

  const run = (key, fn2) => { setBusy(key); setMsg(null); start(async () => { const r = await fn2(); setBusy(null); setMsg(r); if (r?.ok) router.refresh(); }); };

  const card = { padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-1)' };
  const chip = { padding: '8px 12px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--fg-1)' };

  return (
    <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
      {/* Build Estimate — the primary money CTA, opens the Pricebook with job-type suggestions. */}
      <Link href={`/job/${jobId}/pricebook`} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', background: 'linear-gradient(135deg, #1f6e23, #145018)', borderColor: '#2e8b34', color: '#fff' }}>
        <ShoppingCart size={26} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Build Estimate for {fn}</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>Price Book opens{jobType ? ` with ${jobType.toLowerCase()} suggestions` : ' with job-smart suggestions'}</div>
        </div>
        <span style={{ fontSize: 20, fontWeight: 800 }}>→</span>
      </Link>

      {canAct && !done && (
        <>
          {/* En route → Notify */}
          <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, background: 'linear-gradient(135deg,#173a5e,#0f2740)', borderColor: '#2b5f8f' }}>
            <Truck size={22} style={{ color: '#90caf9' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#cfe5fb' }}>{enroute ? `You're marked EN ROUTE to ${fn}` : `Heading to ${fn}?`}</div>
              <div style={{ fontSize: 11.5, color: '#9fc4e8' }}>One tap pings the office to text {fn} your ETA — no bouncing back and forth.</div>
            </div>
            <button onClick={() => run('enroute', () => notifyEnRoute(jobId))} disabled={pending}
              style={{ padding: '10px 14px', borderRadius: 9, border: 'none', background: '#2196f3', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>{busy === 'enroute' ? '…' : 'Notify →'}</button>
          </div>

          {/* Need a hand + step away */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => run('help', () => stepAway(jobId, 'help'))} disabled={pending}
                style={{ ...chip, color: 'var(--red)', borderColor: 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><HandHelping size={15} /> {busy === 'help' ? '…' : 'Need a hand'}</button>
              <span className="muted" style={{ fontSize: 11.5, flex: 1, minWidth: 140 }}>Stepping away? Tell the office why — the job stays open till you tap Done.</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {[['parts_run', '🔩 Parts run'], ['lunch', '🍔 Lunch'], ['personal', '🚻 Personal']].map(([k, label]) => (
                  <button key={k} onClick={() => run(k, () => stepAway(jobId, k))} disabled={pending} style={chip}>{busy === k ? '…' : label}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Roll over */}
          <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <CalendarClock size={18} style={{ color: 'var(--amber)' }} />
            <span style={{ fontSize: 12.5, flex: 1, minWidth: 180 }}>Can’t finish today? Roll this job to another day — same job, parts &amp; history kept.</span>
            {!confirmRoll ? (
              <button onClick={() => setConfirmRoll(true)} disabled={pending} style={{ ...chip, color: 'var(--amber)', borderColor: 'var(--amber-dim)' }}>📆 Roll Over</button>
            ) : (
              <span style={{ display: 'inline-flex', gap: 6 }}>
                <button onClick={() => { setConfirmRoll(false); run('roll', () => rollOverJob(jobId)); }} disabled={pending} style={{ ...chip, color: 'var(--amber)', borderColor: 'var(--amber)' }}>{busy === 'roll' ? '…' : 'Confirm — move +1 day'}</button>
                <button onClick={() => setConfirmRoll(false)} style={{ ...chip, color: 'var(--fg-3)' }}>Cancel</button>
              </span>
            )}
          </div>
        </>
      )}

      {msg && <div style={{ fontSize: 12, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}
    </div>
  );
}
