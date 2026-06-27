'use client';

// My Truck · Maintenance (HTML van pane): oil tracker + van health (keep/watch/replace) + van stats +
// documents + service log. The tech logs mileage/oil/service; the office sees the fleet on the shop sheet.
import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import OdometerScan from '@/components/OdometerScan';
import { setMileage, markOilChanged, logService } from './maintActions';

const money = (c) => '$' + Math.round((Number(c) || 0) / 100).toLocaleString();
const inp = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '8px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box' };
const fmt = (d) => { try { return new Date(d + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return d; } };

export default function Maintenance({ maint = {}, serviceLog = [], oil = {}, health = {}, tech = '' }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [logOpen, setLogOpen] = useState(false);
  const [msg, setMsg] = useState(null);
  const run = (fn, form) => { setMsg(null); start(async () => { const r = await fn(form); if (r && !r.ok) setMsg(r.msg); else { setLogOpen(false); router.refresh(); } }); };
  const sub = (fn) => (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); if (tech) fd.set('tech', tech); run(fn, fd); };
  const milesRef = useRef(null);

  const stat = (h, v, d) => (<div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>{h}</div><div style={{ fontWeight: 800, fontSize: 16, marginTop: 2 }}>{v}</div>{d && <div className="muted" style={{ fontSize: 10.5 }}>{d}</div>}</div>);
  const docRow = (icon, label, thru, url) => (thru || url) ? (<div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '6px 0', borderTop: '1px solid var(--border)' }}><span>{icon}</span><span style={{ flex: 1 }}>{label}{thru ? ` · valid thru ${thru}` : ''}</span>{url ? <a href={url} target="_blank" rel="noreferrer" className="pill" style={{ fontSize: 10 }}>open ›</a> : <span className="muted" style={{ fontSize: 10 }}>no file</span>}</div>) : null;

  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ fontSize: 13, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 8px' }}>🔧 Maintenance{maint.van_label ? ` · ${maint.van_label}` : ''}</h3>

      {/* 🛢 OIL */}
      <div className="card" style={{ borderLeft: `3px solid ${oil.due ? 'var(--red)' : oil.soon ? 'var(--amber)' : 'var(--green)'}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 18 }}>🛢</span>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontWeight: 800 }}>Oil Change{oil.known ? (oil.due ? ' — DUE NOW' : oil.soon ? ' — due soon' : ' — on track') : ''}</div>
            <div className="muted" style={{ fontSize: 11.5 }}>{oil.known ? `${(maint.current_mileage || 0).toLocaleString()} mi · next due ${oil.nextDue.toLocaleString()} mi · ${oil.due ? 'overdue' : `${oil.milesToGo.toLocaleString()} mi to go`}` : 'Log your odometer to start tracking.'}</div>
          </div>
          <form onSubmit={sub(markOilChanged)}><button className="btn" disabled={pending} style={{ fontSize: 12.5 }}>✅ Mark oil changed</button></form>
        </div>
        <form onSubmit={sub(setMileage)} style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap', alignItems: 'center' }}>
          <input ref={milesRef} name="mileage" type="number" inputMode="numeric" placeholder="Current odometer" defaultValue={maint.current_mileage || ''} style={{ ...inp, flex: '1 1 140px' }} />
          <OdometerScan onRead={(m) => { if (milesRef.current) milesRef.current.value = m; }} label="Snap" />
          <button className="pill" disabled={pending} style={{ cursor: 'pointer' }}>📍 Update mileage</button>
        </form>
      </div>

      {/* 🤖 VAN HEALTH */}
      {health.label && (
        <div className="card" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🤖</span>
          <div style={{ flex: 1 }}><div style={{ fontWeight: 800 }}>Van health <span style={{ color: health.color }}>· {health.label}</span></div><div className="muted" style={{ fontSize: 11.5 }}>{money((health.spend || 0) * 100)} repairs last 12 mo{health.age != null ? ` · ${health.age} yrs old` : ''} — {health.note}</div></div>
        </div>
      )}

      {/* VAN STATS */}
      <div className="card" style={{ marginTop: 10, display: 'flex', gap: 22, flexWrap: 'wrap' }}>
        {stat('Mileage', maint.current_mileage ? `${maint.current_mileage.toLocaleString()} mi` : '—')}
        {stat('Last service', maint.last_service_date ? fmt(maint.last_service_date) : '—')}
        {stat('Tire rotation', maint.last_tire_rotation ? fmt(maint.last_tire_rotation) : '—')}
        {stat('DOT thru', maint.dot_through ? fmt(maint.dot_through) : '—')}
      </div>

      {/* 📄 DOCS */}
      {(maint.insurance_through || maint.registration_through || maint.dot_through || maint.insurance_pdf) && (
        <div className="card" style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 800, marginBottom: 2 }}>📄 Van Documents</div>
          {docRow('🛡', 'Insurance card', maint.insurance_through ? fmt(maint.insurance_through) : '', maint.insurance_pdf)}
          {docRow('📋', 'Registration (KY)', maint.registration_through ? fmt(maint.registration_through) : '', maint.registration_pdf)}
          {docRow('✅', 'DOT inspection cert', maint.dot_through ? fmt(maint.dot_through) : '', maint.dot_pdf)}
          <div className="muted" style={{ fontSize: 10.5, marginTop: 6 }}>Always on the iPad — pull it up in seconds if DOT asks.</div>
        </div>
      )}

      {/* SERVICE LOG */}
      <div className="card" style={{ marginTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontWeight: 800, flex: 1 }}>Service log</div>
          <button onClick={() => setLogOpen(!logOpen)} className="pill" style={{ cursor: 'pointer' }}>{logOpen ? 'Close' : '＋ Log service'}</button>
        </div>
        {logOpen && (
          <form onSubmit={sub(logService)} style={{ display: 'grid', gap: 7, marginTop: 9 }}>
            <input name="item" placeholder="What — e.g. Oil + filter, Brake pads (rear)" style={inp} required />
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              <input name="cost" type="number" step="0.01" placeholder="Cost $" style={{ ...inp, flex: 1 }} />
              <input name="vendor" placeholder="Vendor — Larry's Auto" style={{ ...inp, flex: 1 }} />
              <input name="date" type="date" style={{ ...inp, flex: 1 }} />
            </div>
            <button className="btn" disabled={pending}>{pending ? 'Saving…' : 'Add to log'}</button>
          </form>
        )}
        <div style={{ display: 'grid', gap: 4, marginTop: 9 }}>
          {serviceLog.length === 0 && <div className="muted" style={{ fontSize: 12 }}>No service logged yet.</div>}
          {serviceLog.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '5px 0', borderTop: '1px solid var(--border)' }}>
              <span className="muted" style={{ minWidth: 70 }}>{fmt(s.service_date)}</span>
              <span style={{ flex: 1 }}>{s.item}{s.vendor ? ` · ${s.vendor}` : ''}</span>
              {s.cost_cents ? <span style={{ fontWeight: 700 }}>{money(s.cost_cents)}</span> : null}
            </div>
          ))}
        </div>
      </div>

      {msg && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{msg}</div>}
    </div>
  );
}
