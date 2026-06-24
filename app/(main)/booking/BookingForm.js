'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { searchCustomersForBooking, createBooking } from './actions';
import { Search, UserPlus, X } from 'lucide-react';

const input = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '10px 11px', fontSize: 14, fontFamily: 'inherit' };
const label = { fontSize: 11, fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 4 };

// section divider header so the form reads as a guided intake, not a wall of fields
function Section({ n, title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 2px' }}>
      <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--amber)', color: '#1a1206', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</span>
      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--fg-2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{title}</span>
      <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  );
}

// one-tap plumbing job types — fills the Service field so phone-booking is fast (live-board triage feel)
const JOB_PRESETS = ['Drain unclog', 'Water heater', 'Toilet', 'Leak repair', 'Sewer / camera', 'Garbage disposal', 'Faucet / fixture', 'Sump pump', 'Repipe', 'Gas line'];
const PRIORITIES = [{ v: 'normal', label: 'Normal', color: 'var(--fg-2)' }, { v: 'urgent', label: 'Urgent', color: 'var(--amber)' }, { v: 'emergency', label: 'Emergency', color: 'var(--red)' }];

function todayStr() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; }

export default function BookingForm({ techs }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState('existing');     // existing | new
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [picked, setPicked] = useState(null);        // {id,name,phone,address}
  const [addr, setAddr] = useState('');
  const [service, setService] = useState('');        // job type (preset chips + free text)
  const [priority, setPriority] = useState('normal');
  const [msg, setMsg] = useState(null);
  const seq = useRef(0);

  // debounced customer search
  useEffect(() => {
    if (mode !== 'existing' || picked || query.trim().length < 2) { setResults([]); return; }
    const id = ++seq.current;
    const h = setTimeout(async () => { const r = await searchCustomersForBooking(query); if (id === seq.current) setResults(r); }, 220);
    return () => clearTimeout(h);
  }, [query, mode, picked]);

  function onSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (picked) fd.set('customerId', picked.id);
    fd.set('jobType', service); fd.set('priority', priority);
    const d = fd.get('date'), t = fd.get('time');
    if (d && t) { try { fd.set('scheduledISO', new Date(`${d}T${t}`).toISOString()); } catch (_) {} }
    setMsg(null);
    start(async () => { const res = await createBooking(fd); setMsg(res); if (res.ok) { form.reset(); setPicked(null); setQuery(''); setAddr(''); setService(''); setPriority('normal'); router.refresh(); } });
  }

  return (
    <form onSubmit={onSubmit} className="card card-amber" style={{ display: 'grid', gap: 14 }}>
      {/* Customer */}
      <Section n="1" title="Customer" />
      <div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button type="button" onClick={() => { setMode('existing'); setPicked(null); }} className="pill" style={{ cursor: 'pointer', fontWeight: mode === 'existing' ? 800 : 600, background: mode === 'existing' ? 'var(--amber)' : 'var(--surface-2)', color: mode === 'existing' ? '#1a1206' : 'var(--fg-2)' }}>Find existing</button>
          <button type="button" onClick={() => { setMode('new'); setPicked(null); }} className="pill" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: mode === 'new' ? 800 : 600, background: mode === 'new' ? 'var(--amber)' : 'var(--surface-2)', color: mode === 'new' ? '#1a1206' : 'var(--fg-2)' }}><UserPlus size={13} /> New customer</button>
        </div>

        {mode === 'existing' && (
          picked ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 11px', borderRadius: 8, border: '1px solid var(--green)', background: 'var(--surface-2)' }}>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700 }}>{picked.name}</div><div className="muted" style={{ fontSize: 12 }}>{[picked.phone, picked.address].filter(Boolean).join(' · ')}</div></div>
              <button type="button" onClick={() => { setPicked(null); setQuery(''); }} aria-label="Clear" style={{ background: 'none', border: 0, color: 'var(--fg-3)', cursor: 'pointer', display: 'flex' }}><X size={16} /></button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: 13, color: 'var(--fg-3)' }} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or phone…" style={{ ...input, paddingLeft: 32 }} autoComplete="off" />
              {results.length > 0 && (
                <div style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, marginTop: 4, background: 'var(--surface-1)', border: '1px solid var(--border-strong)', borderRadius: 8, overflow: 'hidden', boxShadow: '0 8px 22px rgba(0,0,0,.35)' }}>
                  {results.map((c) => (
                    <button type="button" key={c.id} onClick={() => { setPicked(c); setAddr(c.address || ''); setResults([]); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 11px', background: 'none', border: 0, borderBottom: '1px solid var(--border)', color: 'var(--fg-1)', cursor: 'pointer' }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                      <div className="muted" style={{ fontSize: 11.5 }}>{[c.phone, c.address].filter(Boolean).join(' · ') || 'no contact on file'}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        )}

        {mode === 'new' && (
          <div style={{ display: 'grid', gap: 8 }}>
            <input name="newName" placeholder="Full name" style={input} autoComplete="off" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input name="newPhone" placeholder="Phone" style={input} autoComplete="off" />
              <input name="newAddress" placeholder="Address" style={input} autoComplete="off" />
            </div>
          </div>
        )}
      </div>

      {/* Job */}
      <Section n="2" title="The job" />
      <div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {JOB_PRESETS.map((p) => {
            const on = service === p;
            return <button type="button" key={p} onClick={() => setService(p)} className="pill" style={{ cursor: 'pointer', fontSize: 12, fontWeight: on ? 800 : 600, background: on ? 'var(--amber)' : 'var(--surface-2)', color: on ? '#1a1206' : 'var(--fg-2)', border: '1px solid var(--border)' }}>{p}</button>;
          })}
        </div>
        <input value={service} onChange={(e) => setService(e.target.value)} placeholder="Service — tap a type above or type it (e.g. Drain unclog — kitchen)" style={input} required autoComplete="off" />
      </div>
      <input name="address" value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="Job address (defaults to customer)" style={input} autoComplete="off" />

      {/* Schedule */}
      <Section n="3" title="Schedule" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <div><span style={label}>Date</span><input name="date" type="date" defaultValue={todayStr()} style={input} /></div>
        <div><span style={label}>Time</span><input name="time" type="time" defaultValue="09:00" style={input} /></div>
        <div><span style={label}>Duration</span>
          <select name="durationMin" defaultValue="60" style={input}>{[30, 60, 90, 120, 180, 240].map((m) => <option key={m} value={m}>{m < 60 ? m + 'm' : (m / 60) + 'h'}</option>)}</select>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <div><span style={label}>Tech (optional)</span>
          <select name="techId" defaultValue="" style={input}><option value="">— unassigned —</option>{techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        </div>
        <div><span style={label}>Priority</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {PRIORITIES.map((p) => {
              const on = priority === p.v;
              return <button type="button" key={p.v} onClick={() => setPriority(p.v)} style={{ flex: 1, cursor: 'pointer', padding: '9px 4px', borderRadius: 8, fontSize: 12, fontWeight: on ? 800 : 600, border: `1px solid ${on ? p.color : 'var(--border)'}`, background: on ? `color-mix(in oklab, ${p.color} 16%, var(--surface-2))` : 'var(--surface-2)', color: on ? p.color : 'var(--fg-2)' }}>{p.label}</button>;
            })}
          </div>
        </div>
        <div><span style={label}>Est. $ (optional)</span><input name="amount" type="number" min="0" step="1" placeholder="0" style={input} /></div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button type="submit" className="btn" disabled={pending} style={{ opacity: pending ? 0.6 : 1 }}>{pending ? 'Booking…' : 'Book job'}</button>
        {msg && (
          <span style={{ fontSize: 13, color: msg.ok ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
            {msg.msg}{msg.ok && msg.jobId ? <> · <Link href={`/job/${msg.jobId}`}>open job</Link> · <Link href="/board">board</Link></> : ''}
          </span>
        )}
      </div>
    </form>
  );
}
