'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { saveBankAccount, deleteBankAccount } from './actions';
import { Plus, Trash2, Landmark, Wallet, PiggyBank, CreditCard } from 'lucide-react';

const input = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 10px', fontSize: 14, fontFamily: 'inherit' };
const label = { fontSize: 10, fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 3 };
const money = (c) => '$' + (Math.round(c || 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 });
const KINDS = [{ v: 'checking', l: 'Checking', icon: Landmark }, { v: 'savings', l: 'Savings', icon: PiggyBank }, { v: 'cash', l: 'Cash', icon: Wallet }, { v: 'credit', l: 'Credit (owed)', icon: CreditCard }];
const kindMeta = (k) => KINDS.find((x) => x.v === k) || KINDS[0];

function AccountRow({ a, onDone }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const isNew = !a.id;
  function submit(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setMsg(null);
    start(async () => { const r = await saveBankAccount(fd); setMsg(r.ok ? null : r.msg); if (r.ok) { if (isNew) e.target.reset(); onDone(); } });
  }
  const del = () => start(async () => { await deleteBankAccount(a.id); onDone(); });
  const M = kindMeta(a.kind).icon;
  return (
    <form onSubmit={submit} className="card" style={{ padding: '10px 12px', borderLeft: `3px solid ${a.kind === 'credit' ? 'var(--red)' : 'var(--amber)'}`, opacity: pending ? 0.6 : 1 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
        {a.id && <input type="hidden" name="id" defaultValue={a.id} />}
        <div><span style={label}><M size={11} style={{ verticalAlign: -1 }} /> Account</span><input name="name" defaultValue={a.name || ''} placeholder="e.g. Operating — Chase" style={input} required /></div>
        <div><span style={label}>Type</span>
          <select name="kind" defaultValue={a.kind || 'checking'} style={input}>{KINDS.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}</select>
        </div>
        <div><span style={label}>Balance ($)</span><input name="balance" type="number" step="1" defaultValue={a.balance_cents != null ? Math.round(a.balance_cents) / 100 : ''} placeholder="0" style={input} /></div>
        <div><span style={label}>As of</span><input name="as_of" type="date" defaultValue={a.as_of || ''} style={input} /></div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="submit" className="btn" disabled={pending} style={{ padding: '9px 12px' }}>{isNew ? 'Add' : 'Save'}</button>
          {a.id && <button type="button" onClick={del} disabled={pending} title="Remove" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--red)', borderRadius: 8, padding: '0 10px', cursor: 'pointer' }}><Trash2 size={14} /></button>}
        </div>
      </div>
      {msg && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 6, fontWeight: 700 }}>{msg}</div>}
    </form>
  );
}

export default function BankPositionClient({ accounts, accountsMissing, arCents, transitCents, transitAvailable }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const refresh = () => router.refresh();

  const cashCents = useMemo(() => accounts.filter((a) => a.kind !== 'credit').reduce((s, a) => s + (a.balance_cents || 0), 0), [accounts]);
  const creditCents = useMemo(() => accounts.filter((a) => a.kind === 'credit').reduce((s, a) => s + (a.balance_cents || 0), 0), [accounts]);

  const cards = [
    { k: 'Cash on hand', v: money(cashCents), sub: 'checking + savings + cash', big: true },
    { k: 'AR pipeline', v: money(arCents), sub: 'open invoices owed to you', color: 'var(--fg-1)' },
    transitAvailable ? { k: 'Cash in transit', v: money(transitCents), sub: 'collected, not yet deposited' } : { k: 'Cash in transit', v: '—', sub: 'run cash_custody migration' },
    creditCents ? { k: 'Credit owed', v: money(creditCents), sub: 'balances on credit lines', color: 'var(--red)' } : null,
  ].filter(Boolean);

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, margin: '4px 0 8px' }}>
        {cards.map((c) => (
          <div key={c.k} className="card" style={{ padding: '12px 14px' }}>
            <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>{c.k}</div>
            <div style={{ fontSize: c.big ? 28 : 22, fontWeight: 800, color: c.color || 'var(--amber)', marginTop: 2 }}>{c.v}</div>
            <div className="muted" style={{ fontSize: 11 }}>{c.sub}</div>
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 11.5, margin: '0 0 16px' }}>Cash on hand is what you&apos;ve entered below; AR pipeline + cash-in-transit are pulled live. They&apos;re shown separately on purpose — money owed isn&apos;t money in the bank yet.</p>

      {accountsMissing && <div className="notice" style={{ marginBottom: 14 }}>Bank accounts need their table — run <code>supabase/36_bank_position.sql</code> in Supabase, then add your accounts here.</div>}

      {!accountsMissing && (
        <>
          <div style={{ display: 'grid', gap: 8 }}>
            {accounts.map((a) => <AccountRow key={a.id} a={a} onDone={refresh} />)}
          </div>
          {!accounts.length && <div className="card"><span className="muted">No accounts yet — add your operating, savings, and cash accounts.</span></div>}

          {adding
            ? <div style={{ marginTop: 8 }}><AccountRow a={{}} onDone={() => { setAdding(false); refresh(); }} /></div>
            : <button type="button" className="btn" onClick={() => setAdding(true)} style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Plus size={15} /> Add account</button>}
        </>
      )}
    </>
  );
}
