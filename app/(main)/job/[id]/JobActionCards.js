'use client';

// On-the-job quick actions: Step away (Parts run/Lunch/Personal + Back-on-site) · Build Estimate. (En route
// → Notify moved to the My Day card; Roll over moved to the END of the cockpit — see RollOverCard.)
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { stepAway, backOnSite } from './actions';

const firstName = (n) => String(n || 'the customer').trim().split(/\s+/)[0] || 'the customer';

export default function JobActionCards({ jobId, jobNumber, customerName = '', jobType = '', status = '', canAct = true }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(null);
  const [away, setAway] = useState(null); // step-away active state: the reason label, or null
  const s = String(status || '').toLowerCase();
  const done = /done|complete|closed|cancel/.test(s);
  const fn = firstName(customerName);

  const run = (key, fn2, after) => { setBusy(key); setMsg(null); start(async () => { const r = await fn2(); setBusy(null); setMsg(r); if (r?.ok) { after && after(); router.refresh(); } }); };

  const card = { borderRadius: 12, padding: '10px 12px', marginBottom: 0 };
  const chip = { padding: '7px 11px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: 'var(--surface-2)', border: '1px solid var(--amber-dim)', color: 'var(--amber)' };

  return (
    <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
      {canAct && !done && (
        <>
          {/* (EN ROUTE → Notify moved to the My Day card — "on my way" is a My-Day action; on the job you're
              already at the house. Roll Over moved to the END of the cockpit — bill out or roll over.) */}

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
