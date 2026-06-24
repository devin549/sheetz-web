'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createMembership, setMembershipStatus, searchMembershipCustomers } from './actions';
import { Plus, Repeat, Pause, Play, X, Search } from 'lucide-react';

const input = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '10px 11px', fontSize: 14, fontFamily: 'inherit' };
const label = { fontSize: 11, fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 4 };
const money = (c) => '$' + (Math.round((c || 0)) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 });
const PLAN_PRESETS = ['Drain Club', 'Plunger Plus', 'Total Home Protection', 'Water Heater Care', 'Sewer Shield'];
const STATUS_META = { active: { label: 'Active', color: 'var(--green)' }, paused: { label: 'Paused', color: 'var(--amber)' }, cancelled: { label: 'Cancelled', color: 'var(--fg-3)' } };
const BILL_META = { current: { label: 'paid', color: 'var(--green)' }, past_due: { label: 'past due', color: 'var(--red)' }, comp: { label: 'comp', color: 'var(--amber)' } };

function todayStr() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; }
const annualCents = (m) => (m.price_cents || 0) * (m.period === 'month' ? 12 : 1);

export default function MembershipsClient({ rows }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState('');
  const [period, setPeriod] = useState('year');
  const [billing, setBilling] = useState('current');
  const [custQ, setCustQ] = useState('');
  const [custResults, setCustResults] = useState([]);
  const [pickedCust, setPickedCust] = useState(null);
  const [msg, setMsg] = useState(null);
  const seq = useRef(0);

  useEffect(() => {
    if (pickedCust || custQ.trim().length < 2) { setCustResults([]); return; }
    const id = ++seq.current;
    const h = setTimeout(async () => { const r = await searchMembershipCustomers(custQ); if (id === seq.current) setCustResults(r); }, 220);
    return () => clearTimeout(h);
  }, [custQ, pickedCust]);

  const active = useMemo(() => rows.filter((r) => r.status === 'active'), [rows]);
  const arr = useMemo(() => active.reduce((s, m) => s + annualCents(m), 0), [active]);
  const mrr = Math.round(arr / 12);
  const pastDue = active.filter((m) => m.billing_status === 'past_due').length;

  function onSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget; const fd = new FormData(form);
    fd.set('plan', plan); fd.set('period', period); fd.set('billing_status', billing);
    fd.set('customer', pickedCust ? pickedCust.name : custQ);
    if (pickedCust) fd.set('customerId', pickedCust.id);
    setMsg(null);
    start(async () => {
      const res = await createMembership(fd); setMsg(res);
      if (res.ok) { form.reset(); setPlan(''); setPeriod('year'); setBilling('current'); setCustQ(''); setPickedCust(null); setOpen(false); router.refresh(); }
    });
  }
  const changeStatus = (id, status) => start(async () => { const r = await setMembershipStatus(id, status); if (!r.ok) setMsg(r); router.refresh(); });

  const groups = ['active', 'paused', 'cancelled'].map((s) => ({ s, items: rows.filter((r) => r.status === s) })).filter((g) => g.items.length);

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, margin: '4px 0 16px' }}>
        {[
          { k: 'Monthly recurring', v: money(mrr), sub: 'MRR from active plans' },
          { k: 'Yearly recurring', v: money(arr), sub: 'ARR from active plans' },
          { k: 'Active members', v: String(active.length), sub: `${rows.length} total on file` },
          { k: 'Past due', v: String(pastDue), sub: 'billing needs attention', color: pastDue ? 'var(--red)' : 'var(--green)' },
        ].map((c) => (
          <div key={c.k} className="card" style={{ padding: '12px 14px' }}>
            <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>{c.k}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: c.color || 'var(--amber)', marginTop: 2 }}>{c.v}</div>
            <div className="muted" style={{ fontSize: 11 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <button type="button" className="btn" onClick={() => setOpen((o) => !o)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{open ? <X size={15} /> : <Plus size={15} />}{open ? 'Close' : 'Enroll a customer'}</button>
        {msg && <span style={{ fontSize: 13, fontWeight: 700, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</span>}
      </div>

      {open && (
        <form onSubmit={onSubmit} className="card card-amber" style={{ display: 'grid', gap: 14, marginBottom: 18 }}>
          <div>
            <span style={label}>Customer</span>
            {pickedCust ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 8, border: '1px solid var(--green)', background: 'var(--surface-2)' }}>
                <span style={{ flex: 1, fontWeight: 600 }}>{pickedCust.name}</span>
                <button type="button" onClick={() => { setPickedCust(null); setCustQ(''); }} aria-label="Clear" style={{ background: 'none', border: 0, color: 'var(--fg-3)', cursor: 'pointer', display: 'flex' }}><X size={15} /></button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: 12, color: 'var(--fg-3)' }} />
                <input value={custQ} onChange={(e) => setCustQ(e.target.value)} placeholder="Search or type a customer" style={{ ...input, paddingLeft: 31 }} required autoComplete="off" />
                {custResults.length > 0 && (
                  <div style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, marginTop: 4, background: 'var(--surface-1)', border: '1px solid var(--border-strong)', borderRadius: 8, overflow: 'hidden', boxShadow: '0 8px 22px rgba(0,0,0,.35)' }}>
                    {custResults.map((c) => <button type="button" key={c.id} onClick={() => { setPickedCust(c); setCustResults([]); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 11px', background: 'none', border: 0, borderBottom: '1px solid var(--border)', color: 'var(--fg-1)', cursor: 'pointer', fontSize: 13 }}>{c.name}<span className="muted" style={{ fontSize: 11 }}> {c.phone}</span></button>)}
                  </div>
                )}
              </div>
            )}
          </div>
          <div>
            <span style={label}>Plan</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {PLAN_PRESETS.map((p) => { const on = plan === p; return <button type="button" key={p} onClick={() => setPlan(p)} className="pill" style={{ cursor: 'pointer', fontSize: 12, fontWeight: on ? 800 : 600, background: on ? 'var(--amber)' : 'var(--surface-2)', color: on ? '#1a1206' : 'var(--fg-2)', border: '1px solid var(--border)' }}>{p}</button>; })}
            </div>
            <input value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="Plan name — tap above or type" style={input} required autoComplete="off" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
            <div><span style={label}>Price ($)</span><input name="price" type="number" min="0" step="1" placeholder="0" style={input} /></div>
            <div><span style={label}>Billed</span>
              <div style={{ display: 'flex', gap: 4 }}>{[{ v: 'year', l: 'Yearly' }, { v: 'month', l: 'Monthly' }].map((p) => { const on = period === p.v; return <button type="button" key={p.v} onClick={() => setPeriod(p.v)} style={{ flex: 1, cursor: 'pointer', padding: '9px 4px', borderRadius: 8, fontSize: 12, fontWeight: on ? 800 : 600, border: `1px solid ${on ? 'var(--amber)' : 'var(--border)'}`, background: on ? 'color-mix(in oklab, var(--amber) 16%, var(--surface-2))' : 'var(--surface-2)', color: on ? 'var(--amber)' : 'var(--fg-2)' }}>{p.l}</button>; })}</div>
            </div>
            <div><span style={label}>Discount %</span><input name="discount_pct" type="number" min="0" max="100" step="1" placeholder="e.g. 10" style={input} /></div>
            <div><span style={label}>Billing</span>
              <select name="billing_status" value={billing} onChange={(e) => setBilling(e.target.value)} style={input}><option value="current">Current</option><option value="past_due">Past due</option><option value="comp">Comp</option></select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
            <div><span style={label}>Started</span><input name="started_on" type="date" defaultValue={todayStr()} style={input} /></div>
            <div><span style={label}>Renews</span><input name="renews_on" type="date" style={input} /></div>
            <div><span style={label}>Next service due</span><input name="next_service_due" type="date" style={input} /></div>
          </div>
          <div><span style={label}>Benefits / note</span><input name="benefits" placeholder="e.g. 2 drain checks/yr + 10% off repairs" style={input} autoComplete="off" /></div>
          <div><button type="submit" className="btn" disabled={pending} style={{ opacity: pending ? 0.6 : 1 }}>{pending ? 'Enrolling…' : 'Enroll'}</button></div>
        </form>
      )}

      {!rows.length && <div className="card"><span className="muted">No memberships yet — enroll your first customer above.</span></div>}

      {groups.map((g) => {
        const meta = STATUS_META[g.s];
        return (
          <div key={g.s} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 8px' }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: meta.color, textTransform: 'uppercase', letterSpacing: '.06em' }}>{meta.label}</span>
              <span className="muted" style={{ fontSize: 12 }}>· {g.items.length}</span>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {g.items.map((m) => {
                const bill = BILL_META[m.billing_status] || null;
                return (
                  <div key={m.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderLeft: `3px solid ${meta.color}`, opacity: pending ? 0.7 : 1 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{m.customer}</div>
                      <div className="muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                        <Repeat size={12} /> {m.plan}
                        {m.price_cents ? <span>· {money(m.price_cents)}/{m.period === 'month' ? 'mo' : 'yr'}</span> : null}
                        {bill && <span style={{ color: bill.color, fontWeight: 700 }}>· {bill.label}</span>}
                        {m.discount_pct ? <span>· {m.discount_pct}% off</span> : null}
                        {m.renews_on ? <span>· renews {m.renews_on}</span> : null}
                        {m.next_service_due ? <span>· next service {m.next_service_due}</span> : null}
                      </div>
                      {m.benefits && <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{m.benefits}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {m.status !== 'active' && <button type="button" className="pill" onClick={() => changeStatus(m.id, 'active')} title="Reactivate" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--green)' }}><Play size={12} /> Activate</button>}
                      {m.status === 'active' && <button type="button" className="pill" onClick={() => changeStatus(m.id, 'paused')} title="Pause" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Pause size={12} /> Pause</button>}
                      {m.status !== 'cancelled' && <button type="button" className="pill" onClick={() => changeStatus(m.id, 'cancelled')} title="Cancel" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--red)' }}><X size={12} /> Cancel</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}
