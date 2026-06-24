'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createMembership, setMembershipStatus } from './actions';
import { Plus, Repeat, Pause, Play, X } from 'lucide-react';

const input = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '10px 11px', fontSize: 14, fontFamily: 'inherit' };
const label = { fontSize: 11, fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 4 };
const money = (c) => '$' + (Math.round((c || 0)) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 });
// CB plumbing-native plan names — one-tap presets, still free-text editable.
const PLAN_PRESETS = ['Drain Club', 'Plunger Plus', 'Total Home Protection', 'Water Heater Care', 'Sewer Shield'];
const STATUS_META = {
  active: { label: 'Active', color: 'var(--green)' },
  paused: { label: 'Paused', color: 'var(--amber)' },
  cancelled: { label: 'Cancelled', color: 'var(--fg-3)' },
};

function todayStr() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; }
const annualCents = (m) => (m.price_cents || 0) * (m.period === 'month' ? 12 : 1);

export default function MembershipsClient({ rows }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState('');
  const [period, setPeriod] = useState('year');
  const [msg, setMsg] = useState(null);

  const active = useMemo(() => rows.filter((r) => r.status === 'active'), [rows]);
  const arr = useMemo(() => active.reduce((s, m) => s + annualCents(m), 0), [active]);
  const mrr = Math.round(arr / 12);

  function onSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set('plan', plan); fd.set('period', period);
    setMsg(null);
    start(async () => {
      const res = await createMembership(fd);
      setMsg(res);
      if (res.ok) { form.reset(); setPlan(''); setPeriod('year'); setOpen(false); router.refresh(); }
    });
  }
  const changeStatus = (id, status) => start(async () => { const r = await setMembershipStatus(id, status); if (!r.ok) setMsg(r); router.refresh(); });

  // group: active first, then paused, then cancelled
  const groups = ['active', 'paused', 'cancelled'].map((s) => ({ s, items: rows.filter((r) => r.status === s) })).filter((g) => g.items.length);

  return (
    <>
      {/* recurring-revenue rollup */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, margin: '4px 0 16px' }}>
        {[
          { k: 'Monthly recurring', v: money(mrr), sub: 'MRR from active plans' },
          { k: 'Yearly recurring', v: money(arr), sub: 'ARR from active plans' },
          { k: 'Active members', v: String(active.length), sub: `${rows.length} total on file` },
        ].map((c) => (
          <div key={c.k} className="card" style={{ padding: '12px 14px' }}>
            <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>{c.k}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--amber)', marginTop: 2 }}>{c.v}</div>
            <div className="muted" style={{ fontSize: 11 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <button type="button" className="btn" onClick={() => setOpen((o) => !o)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {open ? <X size={15} /> : <Plus size={15} />}{open ? 'Close' : 'Enroll a customer'}
        </button>
        {msg && <span style={{ fontSize: 13, fontWeight: 700, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</span>}
      </div>

      {open && (
        <form onSubmit={onSubmit} className="card card-amber" style={{ display: 'grid', gap: 14, marginBottom: 18 }}>
          <div>
            <span style={label}>Customer</span>
            <input name="customer" placeholder="Customer name" style={input} required autoComplete="off" />
          </div>
          <div>
            <span style={label}>Plan</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {PLAN_PRESETS.map((p) => {
                const on = plan === p;
                return <button type="button" key={p} onClick={() => setPlan(p)} className="pill" style={{ cursor: 'pointer', fontSize: 12, fontWeight: on ? 800 : 600, background: on ? 'var(--amber)' : 'var(--surface-2)', color: on ? '#1a1206' : 'var(--fg-2)', border: '1px solid var(--border)' }}>{p}</button>;
              })}
            </div>
            <input value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="Plan name — tap above or type" style={input} required autoComplete="off" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <div><span style={label}>Price ($)</span><input name="price" type="number" min="0" step="1" placeholder="0" style={input} /></div>
            <div><span style={label}>Billed</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {[{ v: 'year', l: 'Yearly' }, { v: 'month', l: 'Monthly' }].map((p) => {
                  const on = period === p.v;
                  return <button type="button" key={p.v} onClick={() => setPeriod(p.v)} style={{ flex: 1, cursor: 'pointer', padding: '9px 4px', borderRadius: 8, fontSize: 12, fontWeight: on ? 800 : 600, border: `1px solid ${on ? 'var(--amber)' : 'var(--border)'}`, background: on ? 'color-mix(in oklab, var(--amber) 16%, var(--surface-2))' : 'var(--surface-2)', color: on ? 'var(--amber)' : 'var(--fg-2)' }}>{p.l}</button>;
                })}
              </div>
            </div>
            <div><span style={label}>Started</span><input name="started_on" type="date" defaultValue={todayStr()} style={input} /></div>
            <div><span style={label}>Renews</span><input name="renews_on" type="date" style={input} /></div>
          </div>
          <div><span style={label}>Note (optional)</span><input name="note" placeholder="e.g. annual drain maintenance + 10% off repairs" style={input} autoComplete="off" /></div>
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
              {g.items.map((m) => (
                <div key={m.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderLeft: `3px solid ${meta.color}`, opacity: pending ? 0.7 : 1 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{m.customer}</div>
                    <div className="muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                      <Repeat size={12} /> {m.plan}
                      {m.price_cents ? <span>· {money(m.price_cents)}/{m.period === 'month' ? 'mo' : 'yr'}</span> : null}
                      {m.renews_on ? <span>· renews {m.renews_on}</span> : null}
                    </div>
                    {m.note && <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{m.note}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {m.status !== 'active' && <button type="button" className="pill" onClick={() => changeStatus(m.id, 'active')} title="Reactivate" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--green)' }}><Play size={12} /> Activate</button>}
                    {m.status === 'active' && <button type="button" className="pill" onClick={() => changeStatus(m.id, 'paused')} title="Pause billing" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Pause size={12} /> Pause</button>}
                    {m.status !== 'cancelled' && <button type="button" className="pill" onClick={() => changeStatus(m.id, 'cancelled')} title="Cancel" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--red)' }}><X size={12} /> Cancel</button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
