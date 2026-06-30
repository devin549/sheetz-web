'use client';

// 🚜 Reid's equipment hub — each machine's profile + financing + service log + the money truth (earned vs
// cost = net). Add/retire machines. Tag attaching + scan-out live in My Truck → Equipment.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addUnit, saveProfile, retireUnit, addService, deleteService } from './actions';

const money = (n) => (n < 0 ? '-$' : '$') + Math.abs(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const inp = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '8px 10px', fontSize: 13, width: '100%' };
const lbl = { fontSize: 10.5, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3, display: 'block' };
const Field = ({ label, children }) => (<div><label style={lbl}>{label}</label>{children}</div>);

function ProfileForm({ u, onDone }) {
  return (<>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      <Field label="Make"><input name="make" defaultValue={u?.make || ''} placeholder="John Deere" style={inp} /></Field>
      <Field label="Year"><input name="year" defaultValue={u?.year || ''} placeholder="2022" style={inp} /></Field>
      <Field label="Serial #"><input name="serial" defaultValue={u?.serial || ''} style={inp} /></Field>
      <Field label="Engine hours"><input name="engine_hours" defaultValue={u?.engine_hours ?? ''} style={inp} /></Field>
    </div>
    <Field label="Description"><input name="description" defaultValue={u?.description || ''} placeholder="e.g. mini excavator, thumb + 3 buckets" style={{ ...inp, marginTop: 8 }} /></Field>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
      <Field label="Purchase price"><input name="purchase" defaultValue={u?.purchase_cents != null ? u.purchase_cents / 100 : ''} placeholder="$" style={inp} /></Field>
      <Field label="Purchase date"><input name="purchase_date" type="date" defaultValue={u?.purchase_date || ''} style={inp} /></Field>
    </div>
    <div style={{ marginTop: 10, padding: 10, border: '1px solid var(--border)', borderRadius: 8 }}>
      <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><input type="checkbox" name="financed" defaultChecked={!!u?.financed} /> Financed</label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><input type="checkbox" name="paid_off" defaultChecked={!!u?.paid_off} /> ✅ Paid off</label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <Field label="Lender"><input name="lender" defaultValue={u?.lender || ''} style={inp} /></Field>
        <Field label="Monthly pmt"><input name="monthly" defaultValue={u?.monthly_cents != null ? u.monthly_cents / 100 : ''} placeholder="$/mo" style={inp} /></Field>
        <Field label="Payoff balance"><input name="payoff" defaultValue={u?.payoff_cents != null ? u.payoff_cents / 100 : ''} placeholder="$ owed" style={inp} /></Field>
      </div>
    </div>
  </>);
}

export default function EquipmentManager({ units, pnlById, serviceByUnit }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState(null);
  const [svcId, setSvcId] = useState(null);

  const run = (fn, after) => { setMsg(null); start(async () => { const r = await fn(); setMsg(r); if (r?.ok) { after && after(); router.refresh(); } }); };
  const onAdd = (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); run(() => addUnit(fd), () => setAdding(false)); };
  const onSave = (e, id) => { e.preventDefault(); const fd = new FormData(e.currentTarget); run(() => saveProfile(id, fd), () => setEditId(null)); };
  const onSvc = (e, id) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const form = e.currentTarget; run(() => addService(id, fd), () => form.reset()); };

  return (
    <div className="wrap" style={{ maxWidth: 820 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="h1" style={{ margin: 0 }}>🚜 Equipment</div>
        <button onClick={() => { setAdding((v) => !v); setEditId(null); }} className="btn" style={{ marginLeft: 'auto' }}>{adding ? 'Cancel' : '+ Add machine'}</button>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>Each machine&apos;s details, financing, service, and the money it&apos;s made. Attach tags + scan-out in <a href="/my-truck?sub=equip">My Truck → Equipment</a>.</p>
      {msg && <div className={msg.ok ? 'card' : 'notice'} style={msg.ok ? { borderColor: 'var(--green)' } : undefined}><span style={{ color: msg.ok ? 'var(--green)' : 'var(--red)', fontWeight: 800 }}>{msg.ok ? 'Saved' : 'Error'}</span><span className="muted"> — {msg.msg}</span></div>}

      {adding && (
        <form onSubmit={onAdd} className="card card-amber" style={{ marginTop: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Model *"><input name="model" placeholder="17G Excavator" style={inp} /></Field>
            <Field label="Unit label *"><input name="unit_label" placeholder="17G #5" style={inp} /></Field>
          </div>
          <div style={{ marginTop: 8 }}><ProfileForm u={null} /></div>
          <button className="btn" type="submit" disabled={pending} style={{ marginTop: 10 }}>{pending ? 'Saving…' : 'Add machine'}</button>
        </form>
      )}

      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        {!units.length && <div className="card"><span className="muted">No machines yet — run <code>supabase/146 + 147 + 148</code>, then add one.</span></div>}
        {units.map((u) => {
          const p = pnlById[u.id] || { earned: 0, costs: 0, net: 0, jobs: 0, purchase: 0, service: 0 };
          const svc = serviceByUnit[u.id] || [];
          const out = u.status === 'out';
          return (
            <div key={u.id} className="card">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 15 }}>{u.unit_label}</strong>
                <span className="muted" style={{ fontSize: 12 }}>{u.model}{u.make ? ` · ${u.make}` : ''}{u.year ? ` · ${u.year}` : ''}</span>
                <span className="pill" style={{ fontSize: 10, color: out ? 'var(--red)' : 'var(--green)' }}>{out ? `OUT${u.held_by ? ' · ' + u.held_by : ''}` : 'IN'}</span>
                {u.tag_code ? <span className="pill" style={{ fontSize: 10 }}>🏷 {u.tag_code}</span> : <span className="pill pill-red" style={{ fontSize: 10 }}>no tag</span>}
              </div>

              {/* money truth */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 10 }}>
                <div><div style={{ fontWeight: 800, fontSize: 16, color: 'var(--green-bright)' }}>{money(p.earned)}</div><div className="muted" style={{ fontSize: 10 }}>earned · {p.jobs} job{p.jobs === 1 ? '' : 's'}</div></div>
                <div><div style={{ fontWeight: 800, fontSize: 16 }}>{money(p.costs)}</div><div className="muted" style={{ fontSize: 10 }}>cost (buy+svc)</div></div>
                <div><div style={{ fontWeight: 800, fontSize: 16, color: p.net >= 0 ? 'var(--green-bright)' : 'var(--red)' }}>{money(p.net)}</div><div className="muted" style={{ fontSize: 10 }}>net</div></div>
                <div><div style={{ fontWeight: 800, fontSize: 13, color: u.paid_off ? 'var(--green)' : 'var(--amber)' }}>{u.paid_off ? '✅ Paid off' : (u.payoff_cents ? money(u.payoff_cents / 100) + ' left' : '—')}</div><div className="muted" style={{ fontSize: 10 }}>{u.monthly_cents ? money(u.monthly_cents / 100) + '/mo' : 'financing'}</div></div>
              </div>

              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                <button onClick={() => { setEditId(editId === u.id ? null : u.id); setSvcId(null); }} className="pill" style={{ cursor: 'pointer' }}>{editId === u.id ? 'Close' : '✏️ Edit'}</button>
                <button onClick={() => { setSvcId(svcId === u.id ? null : u.id); setEditId(null); }} className="pill" style={{ cursor: 'pointer' }}>🛠 Service ({svc.length})</button>
                <button onClick={() => { if (confirm(`Retire ${u.unit_label}?`)) run(() => retireUnit(u.id)); }} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--red)', marginLeft: 'auto' }}>Retire</button>
              </div>

              {editId === u.id && (
                <form onSubmit={(e) => onSave(e, u.id)} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  <ProfileForm u={u} />
                  <button className="btn" type="submit" disabled={pending} style={{ marginTop: 10 }}>{pending ? 'Saving…' : 'Save'}</button>
                </form>
              )}

              {svcId === u.id && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  {svc.length > 0 && (
                    <div style={{ display: 'grid', gap: 4, marginBottom: 8 }}>
                      {svc.map((s) => (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, background: 'var(--surface-2)', padding: '6px 9px', borderRadius: 6 }}>
                          <span className="muted" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{s.service_date}</span>
                          <span style={{ flex: 1, minWidth: 0 }}>{s.item}{s.vendor ? <span className="muted"> · {s.vendor}</span> : ''}</span>
                          {s.cost_cents != null && <span style={{ fontWeight: 700 }}>{money(s.cost_cents / 100)}</span>}
                          <button onClick={() => run(() => deleteService(s.id))} disabled={pending} style={{ background: 'none', border: 'none', color: 'var(--fg-3)', cursor: 'pointer' }}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <form onSubmit={(e) => onSvc(e, u.id)} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 6, alignItems: 'end' }}>
                    <input name="item" placeholder="what was serviced" style={inp} required />
                    <input name="vendor" placeholder="vendor" style={inp} />
                    <input name="cost" placeholder="$ cost" style={inp} />
                    <button className="btn" type="submit" disabled={pending} style={{ fontSize: 13 }}>＋ Log</button>
                  </form>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
