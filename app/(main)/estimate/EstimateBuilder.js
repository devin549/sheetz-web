'use client';

import { useMemo, useState, useTransition } from 'react';
import { buildProposal } from '@/lib/pricebook';
import { recordEstimate } from './actions';

const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const ICON = { good: '🥉', better: '🥈', best: '🥇' };
const ctrl = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '8px 10px', fontSize: 13 };

// Seeded from the live iPad example (drain unclog) — editable.
const SEED = [
  { key: 'good', label: 'Good', pitch: 'Clears the clog today.', warranty: '30-day warranty', recommended: false, items: [{ name: 'Drain Unclog', unitPrice: 145, qty: 1 }] },
  { key: 'better', label: 'Better', pitch: 'Clears it AND a camera finds why — so it doesn’t come back.', warranty: '90-day warranty', recommended: true, items: [{ name: 'Drain Unclog', unitPrice: 145, qty: 1 }, { name: 'Camera Scope', unitPrice: 240, qty: 1 }] },
  { key: 'best', label: 'Best', pitch: 'Clears, scopes, + BioOne keeps the line clear for good.', warranty: '1-year warranty', recommended: false, items: [{ name: 'Drain Unclog', unitPrice: 145, qty: 1 }, { name: 'Camera Scope', unitPrice: 240, qty: 1 }, { name: 'BioOne Maintenance', unitPrice: 300, qty: 1 }] },
];

export default function EstimateBuilder() {
  const [customer, setCustomer] = useState('');
  const [isMember, setIsMember] = useState(false);
  const [taxRate, setTaxRate] = useState(0);
  const [tiers, setTiers] = useState(SEED);
  const [view, setView] = useState('build');
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, start] = useTransition();

  const proposal = useMemo(() => {
    try { return buildProposal({ customer, isMember, taxRate: Number(taxRate) || 0, tiers }, { nowISO: new Date().toISOString(), proposalId: 'preview' }); }
    catch { return null; }
  }, [customer, isMember, taxRate, tiers]);

  const setTier = (i, patch) => setTiers((ts) => ts.map((t, x) => (x === i ? { ...t, ...patch } : t)));
  const setItem = (ti, ii, patch) => setTier(ti, { items: tiers[ti].items.map((it, x) => (x === ii ? { ...it, ...patch } : it)) });
  const addItem = (ti) => setTier(ti, { items: [...tiers[ti].items, { name: '', unitPrice: 0, qty: 1 }] });
  const rmItem = (ti, ii) => setTier(ti, { items: tiers[ti].items.filter((_, x) => x !== ii) });
  const setRecommended = (i) => setTiers((ts) => ts.map((t, x) => ({ ...t, recommended: x === i })));

  const choose = (tierKey) => {
    setMsg(null);
    start(async () => {
      const r = await recordEstimate({ customer, jobId: '', isMember, taxRate: Number(taxRate) || 0, tiers, tierKey });
      if (r.ok) setResult(r.accepted); else setMsg(r.msg);
    });
  };

  // ── CUSTOMER VIEW — the presenter (turn the phone to the customer) ──
  if (view === 'customer') {
    if (result) {
      return (
        <div className="card card-amber" style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 40 }}>✅</div>
          <div style={{ fontWeight: 800, fontSize: 18, marginTop: 6 }}>{ICON[result.tier]} {result.tier.charAt(0).toUpperCase() + result.tier.slice(1)} selected · {money(result.amount)}</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>Recorded as an accepted estimate — handed to the office to invoice + collect. <strong>No charge was made.</strong></div>
          <button onClick={() => { setResult(null); setView('build'); }} className="btn" style={{ marginTop: 14 }}>Done</button>
        </div>
      );
    }
    return (
      <>
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <button onClick={() => setView('build')} className="pill" style={{ cursor: 'pointer', fontSize: 12 }}>← Edit</button>
          <span className="muted" style={{ fontSize: 12 }}>{customer ? `For ${customer}` : 'Customer view'}</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--fg-2)', marginBottom: 10, textAlign: 'center' }}>Pick what’s right for you — every option is guaranteed in writing.</div>
        {msg && <div className="notice" style={{ color: 'var(--red)' }}>{msg}</div>}
        <div style={{ display: 'grid', gap: 12 }}>
          {(proposal?.tiers || []).map((t) => {
            const monthly = Math.round(t.total / 24);
            return (
              <div key={t.key} className="card" style={{ position: 'relative', border: t.recommended ? '2px solid var(--accent)' : '1px solid var(--border)', background: t.recommended ? 'color-mix(in oklab, var(--accent) 8%, var(--surface-1))' : 'var(--surface-1)' }}>
                {t.recommended && <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', background: 'var(--green)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 10px', borderRadius: 10, whiteSpace: 'nowrap' }}>★ MOST POPULAR</div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginTop: t.recommended ? 4 : 0 }}>
                  <div><span style={{ fontSize: 22 }}>{ICON[t.key]}</span> <strong style={{ fontSize: 16 }}>{t.label}</strong></div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: t.recommended ? 'var(--accent)' : 'var(--fg-1)' }}>{money(t.total)}</div>
                    <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>or ~{money(monthly)}/mo</div>
                  </div>
                </div>
                {t.pitch && <div style={{ fontSize: 13.5, marginTop: 6, lineHeight: 1.4 }}>{t.pitch}</div>}
                {t.warranty && <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 700, marginTop: 6 }}>🛡 {t.warranty}</div>}
                {t.upgradeTo && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Step up to {t.upgradeTo.label} for +{money(t.upgradeTo.delta)}</div>}
                <button onClick={() => choose(t.key)} disabled={busy} className="btn" style={{ width: '100%', marginTop: 10, background: t.recommended ? 'var(--accent)' : 'var(--surface-2)', color: t.recommended ? '#1a1206' : 'var(--fg-1)', border: t.recommended ? 'none' : '1px solid var(--border-strong)' }}>{busy ? '…' : `This one — ${money(t.total)}`}</button>
              </div>
            );
          })}
        </div>
        <div className="muted" style={{ fontSize: 11, textAlign: 'center', marginTop: 10 }}>Choosing records your estimate — payment is arranged separately with the office.</div>
      </>
    );
  }

  // ── BUILD VIEW (tech) ──
  return (
    <>
      <div className="card">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Customer name" style={{ ...ctrl, flex: 1, minWidth: 160 }} />
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5 }}><input type="checkbox" checked={isMember} onChange={(e) => setIsMember(e.target.checked)} /> Member</label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5 }}>Tax % <input type="number" value={taxRate * 100 || ''} onChange={(e) => setTaxRate((Number(e.target.value) || 0) / 100)} placeholder="0" style={{ ...ctrl, width: 64 }} /></label>
        </div>
      </div>

      {tiers.map((t, ti) => {
        const priced = proposal?.tiers?.find((p) => p.key === t.key);
        return (
          <div key={t.key} className="card card-amber" style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{ICON[t.key]} {t.label}{priced ? <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}> · {money(priced.total)}</span> : ''}</div>
              <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 11.5 }}><input type="radio" name="rec" checked={!!t.recommended} onChange={() => setRecommended(ti)} /> Most popular</label>
            </div>
            <input value={t.pitch} onChange={(e) => setTier(ti, { pitch: e.target.value })} placeholder="One-line pitch (sell peace of mind)…" style={{ ...ctrl, width: '100%', marginTop: 8 }} />
            <input value={t.warranty} onChange={(e) => setTier(ti, { warranty: e.target.value })} placeholder="Warranty (e.g. 90-day warranty)" style={{ ...ctrl, width: '100%', marginTop: 6 }} />
            <div style={{ marginTop: 8 }}>
              {t.items.map((it, ii) => (
                <div key={ii} style={{ display: 'flex', gap: 6, marginTop: 5, alignItems: 'center' }}>
                  <input value={it.name} onChange={(e) => setItem(ti, ii, { name: e.target.value })} placeholder="Item" style={{ ...ctrl, flex: 1 }} />
                  <input type="number" value={it.qty} onChange={(e) => setItem(ti, ii, { qty: Number(e.target.value) || 0 })} title="qty" style={{ ...ctrl, width: 50 }} />
                  <input type="number" value={it.unitPrice} onChange={(e) => setItem(ti, ii, { unitPrice: Number(e.target.value) || 0 })} placeholder="$" style={{ ...ctrl, width: 84 }} />
                  <button onClick={() => rmItem(ti, ii)} className="pill" style={{ cursor: 'pointer', fontSize: 12 }}>✕</button>
                </div>
              ))}
              <button onClick={() => addItem(ti)} className="pill" style={{ cursor: 'pointer', fontSize: 12, marginTop: 6 }}>+ Add item</button>
            </div>
          </div>
        );
      })}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button onClick={() => setView('customer')} disabled={!proposal} className="btn" style={{ opacity: proposal ? 1 : 0.55 }}>👁 Show customer →</button>
      </div>
    </>
  );
}
