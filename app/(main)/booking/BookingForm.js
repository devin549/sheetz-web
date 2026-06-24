'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { searchCustomersForBooking, createBooking, customerSnapshot, verifyAddress } from './actions';
import { triageFor } from '@/lib/triage';
import BookingTriage from './BookingTriage';
import { Search, UserPlus, X, Phone, Mail, AlertTriangle, ChevronDown, ChevronRight, MapPin } from 'lucide-react';

const input = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '10px 11px', fontSize: 14, fontFamily: 'inherit' };
const label = { fontSize: 11, fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 4 };
const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString();

function Section({ n, title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 2px' }}>
      <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--amber)', color: '#1a1206', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</span>
      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--fg-2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{title}</span>
      <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  );
}

const JOB_PRESETS = ['Drain unclog', 'Water heater', 'Toilet', 'Leak repair', 'Sewer / camera', 'Garbage disposal', 'Faucet / fixture', 'Sump pump', 'Repipe', 'Gas line'];
const PRIORITIES = [{ v: 'normal', label: 'Normal', color: 'var(--fg-2)' }, { v: 'urgent', label: 'Urgent', color: 'var(--amber)' }, { v: 'emergency', label: 'Emergency', color: 'var(--red)' }];
const JOB_CLASSES = [{ v: 'residential', l: 'General (residential)' }, { v: 'commercial', l: 'Commercial' }, { v: 'warranty', l: 'Warranty' }, { v: 'insurance', l: 'Insurance' }];
const BUSINESS_UNITS = ['Plumbing', 'Drain Cleaning', 'FloodBusterz', 'HVAC'];
const WARRANTY_PROVIDERS = ['OnCourse', 'AWR', 'Pivotal', 'HomeServe', 'Other'];
// These providers (or an insurance/warranty job class) REQUIRE a claim # before booking.
const CLAIM_PROVIDERS = ['OnCourse', 'AWR', 'Pivotal', 'HomeServe'];
const ARRIVAL_WINDOWS = ['8–10 AM', '10 AM–12 PM', '12–2 PM', '2–4 PM', '4–6 PM', 'Anytime'];
const HOW_HEARD = ['Google', 'Repeat customer', 'Referral', 'Facebook', 'Yard sign', 'Truck wrap', 'Nextdoor', 'Other'];

function todayStr() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; }

export default function BookingForm({ techs }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState('existing');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [picked, setPicked] = useState(null);
  const [snap, setSnap] = useState(null);          // co-pilot snapshot for picked customer
  const [addr, setAddr] = useState('');
  const [city, setCity] = useState('');
  const [stateV, setStateV] = useState('KY');
  const [zip, setZip] = useState('');
  const [geo, setGeo] = useState({});
  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState(null);
  const [service, setService] = useState('');
  const [howHeard, setHowHeard] = useState('');
  const [jobClass, setJobClass] = useState('residential');
  const [provider, setProvider] = useState('');
  const [priority, setPriority] = useState('normal');
  const [showAdmin, setShowAdmin] = useState(false);
  const [serviceConsent, setServiceConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [sendConfirm, setSendConfirm] = useState(false);
  const [msg, setMsg] = useState(null);
  const seq = useRef(0);

  useEffect(() => {
    if (mode !== 'existing' || picked || query.trim().length < 2) { setResults([]); return; }
    const id = ++seq.current;
    const h = setTimeout(async () => { const r = await searchCustomersForBooking(query); if (id === seq.current) setResults(r); }, 220);
    return () => clearTimeout(h);
  }, [query, mode, picked]);

  async function pick(c) {
    setPicked(c); setAddr(c.address || ''); setResults([]); setSnap(null);
    const s = await customerSnapshot(c.id); setSnap(s);
    // repeat customer (has prior work) → pre-fill the marketing source so it's one less step
    if (s && (s.lifetimeJobs > 0 || s.lifetimeRevenue > 0)) setHowHeard('Repeat customer');
  }
  function clearPicked() { setPicked(null); setSnap(null); setQuery(''); setHowHeard(''); }

  function doVerify() {
    setVerifyMsg(null); setVerifying(true);
    (async () => {
      const r = await verifyAddress({ street: addr, city, state: stateV, zip });
      setVerifying(false);
      if (!r.ok) { setVerifyMsg({ ok: false, t: r.msg }); return; }
      if (r.street) setAddr(r.street);
      if (r.city) setCity(r.city);
      if (r.state) setStateV(r.state);
      if (r.zip) setZip(r.zip);
      setGeo({ lat: r.lat, lng: r.lng });
      setVerifyMsg({ ok: true, t: (r.partial ? '⚠ Close match: ' : '✓ Verified: ') + r.formatted, partial: r.partial });
    })();
  }

  const claimRequired = jobClass === 'insurance' || jobClass === 'warranty' || CLAIM_PROVIDERS.includes(provider);
  useEffect(() => { if (claimRequired) setShowAdmin(true); }, [claimRequired]);

  function onSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (picked) fd.set('customerId', picked.id);
    fd.set('jobType', service); fd.set('priority', priority);
    if (claimRequired && !String(fd.get('claimNumber') || '').trim()) {
      setShowAdmin(true); setMsg({ ok: false, msg: `Claim # is required for ${provider || jobClass} jobs — add it before booking.` });
      return;
    }
    fd.set('serviceConsent', serviceConsent ? 'true' : 'false');
    fd.set('marketingConsent', marketingConsent ? 'true' : 'false');
    fd.set('sendConfirm', sendConfirm ? 'true' : 'false');
    const d = fd.get('date'), t = fd.get('time');
    if (d && t) { try { fd.set('scheduledISO', new Date(`${d}T${t}`).toISOString()); } catch (_) {} }
    setMsg(null);
    start(async () => {
      const res = await createBooking(fd);
      setMsg(res);
      if (res.ok) { form.reset(); clearPicked(); setAddr(''); setCity(''); setStateV('KY'); setZip(''); setGeo({}); setVerifyMsg(null); setService(''); setHowHeard(''); setJobClass('residential'); setProvider(''); setPriority('normal'); setMarketingConsent(false); setServiceConsent(false); setSendConfirm(false); router.refresh(); }
    });
  }

  return (
    <form onSubmit={onSubmit} className="card card-amber" style={{ display: 'grid', gap: 14 }}>
      {/* 1 · Customer */}
      <Section n="1" title="Customer" />
      <div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button type="button" onClick={() => { setMode('existing'); clearPicked(); }} className="pill" style={{ cursor: 'pointer', fontWeight: mode === 'existing' ? 800 : 600, background: mode === 'existing' ? 'var(--amber)' : 'var(--surface-2)', color: mode === 'existing' ? '#1a1206' : 'var(--fg-2)' }}>Find existing</button>
          <button type="button" onClick={() => { setMode('new'); clearPicked(); }} className="pill" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: mode === 'new' ? 800 : 600, background: mode === 'new' ? 'var(--amber)' : 'var(--surface-2)', color: mode === 'new' ? '#1a1206' : 'var(--fg-2)' }}><UserPlus size={13} /> New customer</button>
        </div>

        {mode === 'existing' && (picked ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 11px', borderRadius: 8, border: '1px solid var(--green)', background: 'var(--surface-2)' }}>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700 }}>{picked.name}</div><div className="muted" style={{ fontSize: 12 }}>{[picked.phone, picked.address].filter(Boolean).join(' · ')}</div></div>
              <button type="button" onClick={clearPicked} aria-label="Clear" style={{ background: 'none', border: 0, color: 'var(--fg-3)', cursor: 'pointer', display: 'flex' }}><X size={16} /></button>
            </div>
            {/* Dispatcher Co-Pilot snapshot */}
            {snap && (
              <div className="card" style={{ padding: '10px 12px', borderLeft: `3px solid ${snap.doNotService ? 'var(--red)' : 'var(--amber)'}` }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>📋 Co-Pilot · before you book</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                  <span style={{ fontSize: 12.5 }}><strong>{money(snap.lifetimeRevenue)}</strong> <span className="muted">lifetime</span></span>
                  <span style={{ fontSize: 12.5 }}><strong>{snap.lifetimeJobs}</strong> <span className="muted">jobs</span></span>
                  {snap.openBalance > 0 && <span style={{ fontSize: 12.5, color: 'var(--red)', fontWeight: 700 }}>{money(snap.openBalance)} open balance</span>}
                  {snap.lastJob && <span style={{ fontSize: 12.5 }} className="muted">last service {snap.lastJob}</span>}
                  {snap.priorTech && <span style={{ fontSize: 12.5 }} className="muted">last tech: {snap.priorTech}</span>}
                </div>
                {(snap.doNotService || snap.doNotMail || snap.openBalance > 0 || snap.membership || snap.pastIssues > 0 || snap.duplicates > 0) && (
                  <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {snap.membership && <span className="pill" style={{ color: 'var(--green)', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>⭐ Member · {snap.membership}</span>}
                    {snap.doNotService && <span className="pill pill-red" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}><AlertTriangle size={11} /> Do not service</span>}
                    {snap.openBalance > 0 && <span className="pill" style={{ color: 'var(--red)', fontSize: 11 }}>Owes money — confirm before booking</span>}
                    {snap.pastIssues > 0 && <span className="pill" style={{ color: 'var(--amber)', fontSize: 11 }}>⚠ {snap.pastIssues} past issue{snap.pastIssues === 1 ? '' : 's'}</span>}
                    {snap.duplicates > 0 && <span className="pill" style={{ color: 'var(--red)', fontSize: 11 }}>Possible duplicate — {snap.duplicates} share this phone</span>}
                    {snap.doNotMail && <span className="pill" style={{ color: 'var(--amber)', fontSize: 11 }}>Do not mail</span>}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: 13, color: 'var(--fg-3)' }} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or phone…" style={{ ...input, paddingLeft: 32 }} autoComplete="off" />
            {results.length > 0 && (
              <div style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, marginTop: 4, background: 'var(--surface-1)', border: '1px solid var(--border-strong)', borderRadius: 8, overflow: 'hidden', boxShadow: '0 8px 22px rgba(0,0,0,.35)' }}>
                {results.map((c) => (
                  <button type="button" key={c.id} onClick={() => pick(c)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 11px', background: 'none', border: 0, borderBottom: '1px solid var(--border)', color: 'var(--fg-1)', cursor: 'pointer' }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>{[c.phone, c.address].filter(Boolean).join(' · ') || 'no contact on file'}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {mode === 'new' && (
          <div style={{ display: 'grid', gap: 8 }}>
            <input name="newName" placeholder="Full name" style={input} autoComplete="off" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ position: 'relative' }}><Phone size={14} style={{ position: 'absolute', left: 10, top: 12, color: 'var(--fg-3)' }} /><input name="newPhone" placeholder="Phone" style={{ ...input, paddingLeft: 31 }} autoComplete="off" /></div>
              <div style={{ position: 'relative' }}><Mail size={14} style={{ position: 'absolute', left: 10, top: 12, color: 'var(--fg-3)' }} /><input name="customerEmail" type="email" placeholder="Email (receipts & reminders)" style={{ ...input, paddingLeft: 31 }} autoComplete="off" /></div>
            </div>
            <input name="newAddress" placeholder="Address" style={input} autoComplete="off" />
          </div>
        )}
        {mode === 'existing' && picked && (
          <input name="customerEmail" type="email" placeholder="Email for receipts & reminders (optional)" style={{ ...input, marginTop: 8 }} autoComplete="off" />
        )}
      </div>

      {/* Additional contacts */}
      <div>
        <span style={label}>Other contacts <span style={{ textTransform: 'none', fontWeight: 400 }}>— spouse, tenant, property manager (optional)</span></span>
        <input name="contacts" placeholder="e.g. Jane (tenant) 859-555-0144" style={input} autoComplete="off" />
      </div>

      {/* 2 · Service location */}
      <Section n="2" title="Service location" />
      <div style={{ display: 'flex', gap: 6 }}>
        <input name="address" value={addr} onChange={(e) => { setAddr(e.target.value); setVerifyMsg(null); setGeo({}); }} placeholder="Street address (defaults to customer)" style={{ ...input, flex: 1 }} autoComplete="off" />
        <button type="button" onClick={doVerify} disabled={verifying} className="btn" style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5, opacity: verifying ? 0.6 : 1 }}><MapPin size={14} /> {verifying ? 'Verifying…' : 'Verify'}</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.7fr 1fr', gap: 8 }}>
        <input name="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" style={input} autoComplete="off" />
        <input name="state" value={stateV} onChange={(e) => setStateV(e.target.value)} placeholder="State" style={input} autoComplete="off" />
        <input name="zip" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="ZIP" style={input} autoComplete="off" />
      </div>
      {verifyMsg && <div style={{ fontSize: 12, fontWeight: 700, color: verifyMsg.ok ? (verifyMsg.partial ? 'var(--amber)' : 'var(--green)') : 'var(--red)' }}>{verifyMsg.t}</div>}
      <input type="hidden" name="lat" value={geo.lat || ''} />
      <input type="hidden" name="lng" value={geo.lng || ''} />

      {/* 3 · The job */}
      <Section n="3" title="The job" />
      <div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {JOB_PRESETS.map((p) => {
            const on = service === p;
            return <button type="button" key={p} onClick={() => setService(p)} className="pill" style={{ cursor: 'pointer', fontSize: 12, fontWeight: on ? 800 : 600, background: on ? 'var(--amber)' : 'var(--surface-2)', color: on ? '#1a1206' : 'var(--fg-2)', border: '1px solid var(--border)' }}>{p}</button>;
          })}
        </div>
        <input value={service} onChange={(e) => setService(e.target.value)} placeholder="Service — tap a type above or type it" style={input} required autoComplete="off" />
      </div>
      <div><span style={label}>Job class</span>
        <select name="jobClass" value={jobClass} onChange={(e) => setJobClass(e.target.value)} style={input}>{JOB_CLASSES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}</select>
      </div>

      {/* Adaptive triage — appears when the service matches (water heater, drain/sewer) */}
      {triageFor(service) && <BookingTriage key={triageFor(service).id} config={triageFor(service)} />}

      {/* 4 · Schedule & assign */}
      <Section n="4" title="Schedule & assign" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
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
        <div><span style={label}>Arrival window</span>
          <select name="arrivalWindow" defaultValue="" style={input}><option value="">— pick a window —</option>{ARRIVAL_WINDOWS.map((w) => <option key={w} value={w}>{w}</option>)}</select>
        </div>
        <div><span style={label}>Priority</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {PRIORITIES.map((p) => { const on = priority === p.v; return <button type="button" key={p.v} onClick={() => setPriority(p.v)} style={{ flex: 1, cursor: 'pointer', padding: '9px 4px', borderRadius: 8, fontSize: 12, fontWeight: on ? 800 : 600, border: `1px solid ${on ? p.color : 'var(--border)'}`, background: on ? `color-mix(in oklab, ${p.color} 16%, var(--surface-2))` : 'var(--surface-2)', color: on ? p.color : 'var(--fg-2)' }}>{p.label}</button>; })}
          </div>
        </div>
      </div>

      {/* 5 · Dispatch handoff — what the tech needs to know */}
      <Section n="5" title="Dispatch handoff" />
      <div><span style={label}>🚨 Must tell the tech</span><input name="mustTell" placeholder="critical heads-up — gas smell, aggressive dog, prior bad visit…" style={{ ...input, borderColor: 'var(--amber)' }} autoComplete="off" /></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <div><span style={label}>Customer promise</span><input name="customerPromise" placeholder="what we promised them" style={input} autoComplete="off" /></div>
        <div><span style={label}>Access notes</span><input name="accessNotes" placeholder="gate code, parking, lockbox" style={input} autoComplete="off" /></div>
        <div><span style={label}>Sold scope</span><input name="soldScope" placeholder="what was sold / scope" style={input} autoComplete="off" /></div>
      </div>

      {/* Billing & admin (collapsible) */}
      <button type="button" onClick={() => setShowAdmin((s) => !s)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 0, color: 'var(--amber)', cursor: 'pointer', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', padding: 0, marginTop: 2 }}>
        {showAdmin ? <ChevronDown size={15} /> : <ChevronRight size={15} />} Billing &amp; admin · marketing
      </button>
      {showAdmin && (
        <div style={{ display: 'grid', gap: 12, padding: '4px 0 2px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <div><span style={label}>Service call fee $</span><input name="amount" type="number" min="0" step="1" placeholder="0" style={input} /></div>
            <div><span style={label}>Business unit</span>
              <select name="businessUnit" defaultValue="" style={input}><option value="">— select —</option>{BUSINESS_UNITS.map((b) => <option key={b} value={b}>{b}</option>)}</select>
            </div>
            <div><span style={label}>Customer PO #</span><input name="poNumber" placeholder="defaults to job #" style={input} autoComplete="off" /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <div><span style={label}>Warranty / provider</span>
              <select name="warrantyProvider" value={provider} onChange={(e) => setProvider(e.target.value)} style={input}><option value="">— none —</option>{WARRANTY_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}</select>
            </div>
            <div><span style={label}>Claim #{claimRequired && <span style={{ color: 'var(--red)' }}> *</span>}</span><input name="claimNumber" placeholder={claimRequired ? 'required for this provider' : 'warranty claim #'} style={{ ...input, borderColor: claimRequired ? 'var(--amber)' : 'var(--border)' }} autoComplete="off" /></div>
          </div>
          {claimRequired && <div style={{ fontSize: 11.5, color: 'var(--amber)', fontWeight: 700, marginTop: -4 }}>⚠ {provider || (jobClass === 'insurance' ? 'Insurance' : 'Warranty')} jobs can&apos;t book without a claim #.</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <div><span style={label}>How did they hear about us?{howHeard === 'Repeat customer' && <span style={{ color: 'var(--green)', textTransform: 'none', fontWeight: 700 }}> · auto</span>}</span>
              <select name="howHeard" value={howHeard} onChange={(e) => setHowHeard(e.target.value)} style={input}><option value="">— ask the caller —</option>{HOW_HEARD.map((h) => <option key={h} value={h}>{h}</option>)}</select>
            </div>
            <div><span style={label}>Referral code</span><input name="referralCode" placeholder="which customer sent them?" style={input} autoComplete="off" /></div>
          </div>
        </div>
      )}

      {/* Notes */}
      <div><span style={label}>Notes</span><textarea name="notes" rows={2} placeholder="Gate code, pets, problem description…" style={{ ...input, resize: 'vertical' }} /></div>

      {/* Stay in touch — consent */}
      <div className="card" style={{ padding: '12px 14px', background: 'var(--surface-1)' }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>📣 Stay in touch</div>
        <div className="muted" style={{ fontSize: 11.5, fontStyle: 'italic', marginBottom: 8 }}>Read to the caller: “Okay if we text and email you about your service?”</div>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: 'pointer', marginBottom: 6 }}>
          <input type="checkbox" checked={serviceConsent} onChange={(e) => setServiceConsent(e.target.checked)} style={{ marginTop: 2 }} />
          <span><strong>OK to text &amp; email about service</strong> — confirmations, reminders, “on the way” updates</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={marketingConsent} onChange={(e) => setMarketingConsent(e.target.checked)} style={{ marginTop: 2 }} />
          <span>OK for <strong>marketing &amp; automated follow-ups</strong> — separate opt-in</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: serviceConsent ? 'pointer' : 'not-allowed', marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)', opacity: serviceConsent ? 1 : 0.5 }}>
          <input type="checkbox" checked={sendConfirm && serviceConsent} disabled={!serviceConsent} onChange={(e) => setSendConfirm(e.target.checked)} style={{ marginTop: 2 }} />
          <span>📲 <strong>Send the booking confirmation text now</strong> — one text to this customer when you book{!serviceConsent ? ' (needs text consent above)' : ''}</span>
        </label>
        <div className="muted" style={{ fontSize: 10.5, marginTop: 8 }}>Consent is recorded on the customer. The only thing that sends is this one confirmation, because you ticked it — no automated blasts.</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button type="submit" className="btn" disabled={pending} style={{ opacity: pending ? 0.6 : 1 }}>{pending ? 'Booking…' : 'Book job'}</button>
        <span className="muted" style={{ fontSize: 11 }}>Customer, service + a date/time are required.</span>
        {msg && (
          <span style={{ fontSize: 13, color: msg.ok ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
            {msg.msg}{msg.ok && msg.jobId ? <> · <Link href={`/job/${msg.jobId}`}>open job</Link> · <Link href="/board">board</Link></> : ''}
          </span>
        )}
      </div>
    </form>
  );
}
