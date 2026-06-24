'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { logCash, receiveCash, depositCash, flagMissing } from './actions';

const money = (c) => '$' + (Number(c || 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 });
const input = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14, fontFamily: 'inherit', width: '100%' };
const fmt = (iso) => { try { return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };
const isToday = (iso) => { try { return new Date(iso).toDateString() === new Date().toDateString(); } catch { return false; } };
const STATUS = { collected: { label: 'With tech', color: 'var(--amber)' }, turned_in: { label: 'With office', color: 'var(--info-text)' }, deposited: { label: 'Deposited', color: 'var(--green)' }, missing: { label: 'MISSING', color: 'var(--red)' } };

function EntryRow({ e, run, pending }) {
  const [dep, setDep] = useState(false);
  const [ref, setRef] = useState('');
  const s = STATUS[e.status] || STATUS.collected;
  const deposit = () => { const fd = new FormData(); fd.set('id', e.id); fd.set('depositRef', ref); run(() => depositCash(fd)); };
  return (
    <div className="card" style={{ borderLeft: `3px solid ${s.color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{money(e.amount_cents)} <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>· {e.tech_name || 'Tech'}{e.customer ? ` · ${e.customer}` : ''}</span></div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>collected {fmt(e.collected_at)}{e.received_by ? ` · in by ${e.received_by}` : ''}{e.deposit_ref ? ` · dep #${e.deposit_ref}` : ''}{e.note ? ` · ${e.note}` : ''}</div>
        </div>
        <span className="pill" style={{ fontSize: 10.5, color: s.color, alignSelf: 'flex-start', fontWeight: 800 }}>{s.label}</span>
      </div>
      {(e.status === 'collected' || e.status === 'turned_in') && (
        dep ? (
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <input value={ref} onChange={(ev) => setRef(ev.target.value)} placeholder="Deposit slip # (optional)" style={{ ...input, maxWidth: 220 }} />
            <button disabled={pending} onClick={deposit} className="pill" style={{ cursor: 'pointer', background: 'rgba(70,193,120,.16)', color: 'var(--green)', fontWeight: 800 }}>Confirm deposit</button>
            <button onClick={() => setDep(false)} className="pill" style={{ cursor: 'pointer' }}>Cancel</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {e.status === 'collected' && <button disabled={pending} onClick={() => run(() => receiveCash(e.id))} className="pill" style={{ cursor: 'pointer' }}>Turned in</button>}
            <button disabled={pending} onClick={() => setDep(true)} className="pill" style={{ cursor: 'pointer', color: 'var(--green)' }}>Deposit</button>
            <button disabled={pending} onClick={() => run(() => flagMissing(e.id))} className="pill" style={{ cursor: 'pointer', color: 'var(--red)' }}>Flag missing</button>
          </div>
        )
      )}
    </div>
  );
}

export default function CashCustodyClient({ entries, techs }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const formRef = useRef(null);
  const run = (fn) => { setMsg(null); start(async () => { const r = await fn(); setMsg(r); if (r?.ok) router.refresh(); }); };

  const sums = useMemo(() => {
    const s = { inHand: 0, office: 0, depToday: 0, missing: 0, byTech: {} };
    entries.forEach((e) => {
      if (e.status === 'collected') { s.inHand += e.amount_cents; const k = e.tech_name || 'Unknown'; s.byTech[k] = (s.byTech[k] || 0) + e.amount_cents; }
      else if (e.status === 'turned_in') s.office += e.amount_cents;
      else if (e.status === 'deposited' && isToday(e.deposited_at)) s.depToday += e.amount_cents;
      else if (e.status === 'missing') s.missing += 1;
    });
    return s;
  }, [entries]);
  const techHolders = Object.entries(sums.byTech).sort((a, b) => b[1] - a[1]);

  function onLog(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const t = techs.find((x) => x.id === fd.get('techId')); if (t) fd.set('techName', t.name);
    setMsg(null);
    start(async () => { const r = await logCash(fd); setMsg(r); if (r.ok) { formRef.current?.reset(); router.refresh(); } });
  }

  return (
    <>
      <div className="card" style={{ display: 'flex', gap: 22, flexWrap: 'wrap', borderTop: '2px solid var(--amber)' }}>
        <div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>With techs (exposure)</div><div style={{ fontSize: 22, fontWeight: 800, color: sums.inHand ? 'var(--amber)' : 'var(--fg-1)' }}>{money(sums.inHand)}</div></div>
        <div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>With office</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--info-text)' }}>{money(sums.office)}</div></div>
        <div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>Deposited today</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>{money(sums.depToday)}</div></div>
        {sums.missing > 0 && <div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>Missing</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--red)' }}>{sums.missing}</div></div>}
      </div>
      {techHolders.length > 0 && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Holding cash: {techHolders.map(([t, c]) => `${t} ${money(c)}`).join(' · ')}</div>}
      {msg && <div className="muted" style={{ fontSize: 12, margin: '6px 0', color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}

      <form ref={formRef} onSubmit={onLog} className="card card-amber" style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        <div style={{ fontWeight: 800 }}>Log cash collected</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          <select name="techId" defaultValue="" style={input} required><option value="">Tech…</option>{techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <input name="customer" placeholder="Customer (optional)" style={input} autoComplete="off" />
          <input name="amount" placeholder="Amount $" inputMode="decimal" style={input} required />
          <button type="submit" className="btn" disabled={pending}>{pending ? '…' : 'Log'}</button>
        </div>
        <input name="note" placeholder="Note (optional)" style={input} autoComplete="off" />
      </form>

      <h3 style={{ fontSize: 12, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.5px', margin: '18px 0 8px' }}>Cash entries</h3>
      <div style={{ display: 'grid', gap: 6 }}>
        {entries.map((e) => <EntryRow key={e.id} e={e} run={run} pending={pending} />)}
        {!entries.length && <div className="card"><span className="muted">No cash logged. Log a collection above as cash comes in.</span></div>}
      </div>
    </>
  );
}
