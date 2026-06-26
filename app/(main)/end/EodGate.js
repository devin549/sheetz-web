'use client';

// End of Day GATE (HTML eod pane) — go home clean: tools check-IN (vs the morning check-out), cash
// custody per §21, van end-of-shift odometer/gas, then Clock Out. Mirrors the Start of Day gate.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { GAS_LEVELS } from '@/lib/sod';
import { confirmToolsIn, saveEodVan, setCash, clockOut } from './eodActions';

const inp = { width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14 };

function Sec({ icon, title, sub, green, children }) {
  return (
    <div className="card" style={{ borderLeft: `3px solid ${green ? 'var(--green)' : 'var(--amber)'}`, marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <div style={{ flex: 1 }}><div style={{ fontWeight: 800 }}>{title}</div>{sub && <div className="muted" style={{ fontSize: 11.5 }}>{sub}</div>}</div>
        {green && <span className="pill" style={{ fontSize: 9.5, color: 'var(--green)', border: '1px solid var(--green)' }}>✓ DONE</span>}
      </div>
      {children}
    </div>
  );
}

export default function EodGate({ sod = {}, stats = {} }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cash, setCashAmt] = useState(sod.cash_in_hand_cents ? (sod.cash_in_hand_cents / 100).toString() : '');
  const [editVan, setEditVan] = useState(false);
  const [msg, setMsg] = useState(null);
  const run = (fn) => { setMsg(null); start(async () => { const r = await fn(); if (r && !r.ok) setMsg(r.msg); else { setEditVan(false); router.refresh(); } }); };

  const toolsIn = !!sod.tools_checked_in;
  const vanDone = sod.end_odometer != null;
  const cashSet = !!sod.cash_custody;
  const ready = toolsIn; // tools check-in is the hard gate to clock out
  const miles = (sod.end_odometer != null && sod.odometer != null) ? Math.max(0, sod.end_odometer - sod.odometer) : null;

  return (
    <div style={{ marginTop: 16 }}>
      {/* stats */}
      <div className="card card-amber" style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>Jobs closed</div><div style={{ fontSize: 24, fontWeight: 800 }}>{stats.closed ?? 0}</div></div>
        <div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>Earned today</div><div style={{ fontSize: 24, fontWeight: 800, color: 'var(--green-bright)' }}>${Number(stats.earned || 0).toLocaleString()}</div></div>
        {stats.openItems != null && <div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>Open items</div><div style={{ fontSize: 24, fontWeight: 800, color: stats.openItems ? 'var(--amber)' : 'var(--green)' }}>{stats.openItems}</div></div>}
      </div>

      {/* 🧰 tools check-in */}
      <Sec icon="🧰" title="Tools Check-In" sub="Same items back on the van · compared to this morning" green={toolsIn}>
        {toolsIn ? <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>✓ All tools accounted for · matches morning check-out.</div>
          : <button onClick={() => run(() => confirmToolsIn())} disabled={pending} className="btn" style={{ marginTop: 9 }}>{pending ? 'Saving…' : '✓ All tools back on my van'}</button>}
      </Sec>

      {/* 💵 cash custody */}
      <Sec icon="💵" title="Cash Custody · today" sub="Per §21 — drop at office same-day or hold to Monday 8am" green={cashSet}>
        {cashSet ? <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>✓ {sod.cash_in_hand_cents ? `$${(sod.cash_in_hand_cents / 100).toLocaleString()} ` : ''}{sod.cash_custody === 'dropped' ? 'dropped at the office tonight.' : 'holding to Monday 8am.'}</div>
          : (
            <div style={{ marginTop: 9, display: 'grid', gap: 8 }}>
              <input value={cash} onChange={(e) => setCashAmt(e.target.value)} type="number" inputMode="decimal" placeholder="Cash in hand today ($) — 0 if none" style={inp} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => run(() => setCash('dropped', cash))} disabled={pending} className="btn">✓ Dropping at office tonight</button>
                <button onClick={() => run(() => setCash('hold', cash))} disabled={pending} className="btn btn-ghost">📦 Hold to Monday 8am</button>
              </div>
            </div>
          )}
      </Sec>

      {/* 🚐 van end of shift */}
      <Sec icon="🚐" title="Van · End of shift" sub={`Morning ${sod.odometer ? sod.odometer.toLocaleString() + ' mi' : 'odometer'}${sod.gas_level ? ` · gas ${sod.gas_level}` : ''}`} green={vanDone}>
        {vanDone && !editVan ? (
          <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>✓ End {sod.end_odometer.toLocaleString()} mi{sod.end_gas ? ` · gas ${sod.end_gas}` : ''}{miles != null ? ` · ${miles} mi driven` : ''}. <button onClick={() => setEditVan(true)} className="pill" style={{ cursor: 'pointer', marginLeft: 6 }}>redo</button></div>
        ) : (
          <form action={(form) => run(() => saveEodVan(form))} style={{ display: 'grid', gap: 9, marginTop: 9 }}>
            <input name="end_odometer" type="number" inputMode="numeric" placeholder="Odometer (end)" defaultValue={sod.end_odometer || ''} style={inp} />
            <div>
              <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Gas level (end)</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{GAS_LEVELS.map((lvl) => <label key={lvl} className="pill" style={{ cursor: 'pointer', fontSize: 12 }}><input type="radio" name="end_gas" value={lvl} defaultChecked={sod.end_gas === lvl} style={{ marginRight: 5 }} />{lvl}</label>)}</div>
            </div>
            <button className="btn" type="submit" disabled={pending}>Save end-of-shift</button>
          </form>
        )}
      </Sec>

      {/* 🏁 clock out */}
      <button onClick={() => run(() => clockOut())} disabled={pending || !ready}
        style={{ width: '100%', marginTop: 12, padding: 16, borderRadius: 13, fontSize: 16, fontWeight: 800, cursor: ready ? 'pointer' : 'not-allowed', border: 'none', background: sod.eod_done ? 'var(--green)' : ready ? 'var(--amber)' : 'var(--surface-3)', color: sod.eod_done || ready ? '#1a1206' : 'var(--fg-3)', opacity: pending ? 0.6 : 1 }}>
        {sod.eod_done ? '✓ Clocked out — go home clean' : ready ? '🏁 Clock Out · Go Home Clean' : 'Check your tools back in to clock out'}
      </button>
      {msg && <div style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 8 }}>{msg}</div>}
    </div>
  );
}
