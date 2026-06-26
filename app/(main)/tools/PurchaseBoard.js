'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createToolPurchase, postDeduction, postWeeklyForAll, closeOnSeparation } from './purchaseActions';
import { centsToStr, remainingCents, pctPaid, weeksLeft } from '@/lib/toolPurchase';

const inp = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 7, padding: '8px 10px', fontSize: 13 };
const STATUS = { active: { c: 'var(--amber)', l: 'Paying off' }, paid_off: { c: 'var(--green)', l: 'Paid off · theirs' }, closed: { c: 'var(--fg-3)', l: 'Closed · refunded' } };

export default function PurchaseBoard({ plans = [], summary }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ techName: '', toolName: '', valueDollars: '', weeklyPct: '10', vendor: '' });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const create = () => start(async () => { const r = await createToolPurchase(f); setMsg(r.msg); if (r.ok) { setF({ techName: '', toolName: '', valueDollars: '', weeklyPct: '10', vendor: '' }); setOpen(false); router.refresh(); } });
  const deduct = (id) => start(async () => { const r = await postDeduction(id); setMsg(r.msg); router.refresh(); });
  const runAll = () => start(async () => { const r = await postWeeklyForAll(); setMsg(r.msg); router.refresh(); });
  const close = (id, name) => { if (!confirm(`Close ${name}'s plan? Refunds what they've paid; company keeps the tool.`)) return; start(async () => { const r = await closeOnSeparation(id); setMsg(r.msg); router.refresh(); }); };

  const active = plans.filter((p) => p.status === 'active');
  const rest = plans.filter((p) => p.status !== 'active').slice(0, 12);

  return (
    <div style={{ marginTop: 18 }}>
      <div className="h2" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span>🧰 Tool purchase plans</span>
        <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>{summary.count} active · {centsToStr(summary.weeklyCents)}/wk · {centsToStr(summary.owedCents)} owed</span>
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: -4 }}>Company buys the tool (company property) → a weekly payroll deduction pays it down. Fired/quit before payoff → refund what's paid, company keeps the tool.</p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0 12px' }}>
        <button onClick={() => setOpen((v) => !v)} className="btn" style={{ padding: '8px 12px' }}>＋ New plan</button>
        {active.length > 0 && <button onClick={runAll} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}>▶ Run this week's deductions</button>}
      </div>

      {open && (
        <div className="card" style={{ marginBottom: 12, display: 'grid', gap: 7 }}>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            <input value={f.techName} onChange={set('techName')} placeholder="tech name" style={{ ...inp, flex: '1 1 140px' }} />
            <input value={f.toolName} onChange={set('toolName')} placeholder="tool (e.g. K-60 cable machine)" style={{ ...inp, flex: '1 1 200px' }} />
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={f.valueDollars} onChange={set('valueDollars')} placeholder="tool value $" inputMode="decimal" style={{ ...inp, width: 120 }} />
            <span className="muted" style={{ fontSize: 12 }}>weekly %</span>
            <input value={f.weeklyPct} onChange={set('weeklyPct')} inputMode="decimal" style={{ ...inp, width: 64 }} />
            <input value={f.vendor} onChange={set('vendor')} placeholder="vendor (optional)" style={{ ...inp, flex: '1 1 120px' }} />
          </div>
          {f.valueDollars && Number(f.valueDollars) > 0 && Number(f.weeklyPct) > 0 && (
            <div className="muted" style={{ fontSize: 12 }}>≈ {centsToStr(Math.round(Number(f.valueDollars) * Number(f.weeklyPct)))} /week · ~{Math.ceil(100 / Number(f.weeklyPct))} weeks to pay off</div>
          )}
          <div><button onClick={create} disabled={pending} className="btn" style={{ padding: '8px 14px' }}>Start plan</button></div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 7 }}>
        {active.map((p) => {
          const rem = remainingCents(p); const pc = pctPaid(p); const wl = weeksLeft(p);
          return (
            <div key={p.id} className="card" style={{ padding: '11px 13px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800 }}>{p.tool_name}</span>
                <span className="muted" style={{ fontSize: 12.5 }}>· {p.tech_name}</span>
                <span className="pill" style={{ fontSize: 10, marginLeft: 'auto', color: 'var(--amber)' }}>{centsToStr(p.weekly_cents)}/wk · {p.weekly_pct}%</span>
              </div>
              <div style={{ height: 7, background: 'var(--surface-2)', borderRadius: 5, overflow: 'hidden', margin: '8px 0 5px' }}>
                <div style={{ width: `${pc}%`, height: '100%', background: 'var(--green)' }} />
              </div>
              <div className="muted" style={{ fontSize: 12 }}>{centsToStr(p.paid_cents)} of {centsToStr(p.purchase_cents)} paid · {centsToStr(rem)} left{wl != null ? ` · ~${wl} wk${wl === 1 ? '' : 's'}` : ''}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
                <button onClick={() => deduct(p.id)} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--green)' }}>＋ Deduct {centsToStr(Math.min(p.weekly_cents, rem))}</button>
                <button onClick={() => close(p.id, p.tech_name)} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--red)' }}>🚪 Fired/quit — refund &amp; keep</button>
              </div>
            </div>
          );
        })}
        {active.length === 0 && <div className="card"><span className="muted">No active tool plans. Add one above, or set one up from a tool receipt.</span></div>}
      </div>

      {rest.length > 0 && (
        <>
          <div className="h2" style={{ marginTop: 14, fontSize: 14 }}>Closed &amp; paid off</div>
          <div style={{ display: 'grid', gap: 4 }}>
            {rest.map((p) => {
              const s = STATUS[p.status] || STATUS.closed;
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 11px', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>{p.tool_name}</span>
                  <span className="muted">· {p.tech_name}</span>
                  <span className="muted">· {centsToStr(p.paid_cents)} of {centsToStr(p.purchase_cents)}</span>
                  <span className="pill" style={{ fontSize: 10, marginLeft: 'auto', color: s.c }}>{s.l}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {msg && <div style={{ fontSize: 12, marginTop: 8, color: 'var(--green)' }}>{msg}</div>}
    </div>
  );
}
