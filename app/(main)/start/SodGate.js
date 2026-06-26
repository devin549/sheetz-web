'use client';

// Start of Day GATE (HTML sod pane) — van pre-trip + tools check-out + helper + handbook re-ack + KY code,
// then "Unlock My Day". The 3 hard gates (pre-trip, tools, handbook) must be green to start the first job.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { GAS_LEVELS, HANDBOOK_RECAP, KY_CODE, gateState } from '@/lib/sod';
import { savePretrip, confirmTools, ackHandbook } from './sodActions';

const inp = { width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14 };
const Check = ({ name, label, def }) => (<label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, padding: '4px 0' }}><input type="checkbox" name={name} defaultChecked={def} /> {label}</label>);

function SectionShell({ icon, title, sub, green, required, children }) {
  return (
    <div className="card" style={{ borderLeft: `3px solid ${green ? 'var(--green)' : required ? 'var(--amber)' : 'var(--border)'}`, marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <div style={{ flex: 1 }}><div style={{ fontWeight: 800 }}>{title}</div>{sub && <div className="muted" style={{ fontSize: 11.5 }}>{sub}</div>}</div>
        <span className="pill" style={{ fontSize: 9.5, color: green ? 'var(--green)' : required ? 'var(--amber)' : 'var(--fg-3)', border: `1px solid ${green ? 'var(--green)' : required ? 'var(--amber)' : 'var(--border)'}` }}>{green ? '✓ DONE' : required ? '⏳ REQUIRED' : 'INFO'}</span>
      </div>
      {children}
    </div>
  );
}

export default function SodGate({ sod = {}, tools = [], handbook = {}, helper = null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const [editPretrip, setEditPretrip] = useState(false);
  const [editTools, setEditTools] = useState(false);
  const [missing, setMissing] = useState('');
  const g = gateState(sod);

  const run = (fn) => { setMsg(null); start(async () => { const r = await fn(); if (r && !r.ok) setMsg(r.msg); else { setEditPretrip(false); setEditTools(false); router.refresh(); } }); };
  const onPretrip = (form) => run(() => savePretrip(form));

  return (
    <div style={{ marginTop: 16 }}>
      {/* gate header */}
      <div className="card" style={{ background: g.ready ? 'color-mix(in oklab, var(--green) 12%, var(--surface-1))' : 'var(--surface-1)', border: `2px solid ${g.ready ? 'var(--green)' : 'var(--amber)'}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 22 }}>🛡</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Start of Day Gate — {g.greens} of {g.required} ready</div>
            <div className="muted" style={{ fontSize: 11.5 }}>Pre-trip + tools + handbook must be green before your first job. Helper &amp; KY-code are job-by-job.</div>
          </div>
          {g.ready && <Link href="/my-day" className="btn">Unlock My Day →</Link>}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {g.items.map((i) => <span key={i.key} className="pill" style={{ fontSize: 10.5, color: i.green ? 'var(--green)' : 'var(--amber)', border: `1px solid ${i.green ? 'var(--green)' : 'var(--amber)'}` }}>{i.green ? '✓' : '⏳'} {i.label}</span>)}
        </div>
      </div>

      {/* 🚐 PRE-TRIP */}
      <SectionShell icon="🚐" title="Van Pre-Trip" sub="Odometer, gas, safety check + no-text-&-drive" green={g.pretrip} required>
        {g.pretrip && !editPretrip ? (
          <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>✓ {sod.odometer ? `${sod.odometer.toLocaleString()} mi · ` : ''}{sod.gas_level ? `gas ${sod.gas_level} · ` : ''}safety checked. <button onClick={() => setEditPretrip(true)} className="pill" style={{ cursor: 'pointer', marginLeft: 6 }}>redo</button></div>
        ) : (
          <form action={onPretrip} style={{ display: 'grid', gap: 9, marginTop: 9 }}>
            <input name="odometer" type="number" inputMode="numeric" placeholder="Odometer (start)" defaultValue={sod.odometer || ''} style={inp} />
            <div>
              <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Gas level (start)</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {GAS_LEVELS.map((lvl) => (<label key={lvl} className="pill" style={{ cursor: 'pointer', fontSize: 12 }}><input type="radio" name="gas_level" value={lvl} defaultChecked={sod.gas_level === lvl} style={{ marginRight: 5 }} />{lvl}</label>))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <Check name="tires_ok" label="Tires OK" def={sod.tires_ok} />
              <Check name="oil_ok" label="No oil light" def={sod.oil_ok} />
              <Check name="windshield_ok" label="Windshield clean" def={sod.windshield_ok} />
              <Check name="spare_keys" label="Spare keys" def={sod.spare_keys} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, padding: '6px 8px', borderRadius: 8, background: 'rgba(255,179,0,0.1)', border: '1px solid var(--amber-dim)' }}><input type="checkbox" name="no_text_affirm" defaultChecked={sod.no_text_affirm} required /> I will NOT text and drive today. Phone face-down while moving. <span className="muted">(KY law + CB policy)</span></label>
            <button className="btn" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save pre-trip'}</button>
          </form>
        )}
      </SectionShell>

      {/* 🧰 TOOLS CHECK-OUT */}
      <SectionShell icon="🧰" title="Tools Check-Out" sub={`${tools.length} on your roster · confirm what's with you`} green={g.tools} required>
        {g.tools && !editTools ? (
          <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>✓ Roster confirmed.{sod.tools_missing ? <span style={{ color: 'var(--red)' }}> Reported missing: {sod.tools_missing}</span> : ''} <button onClick={() => setEditTools(true)} className="pill" style={{ cursor: 'pointer', marginLeft: 6 }}>redo</button></div>
        ) : (
          <div style={{ marginTop: 9 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxHeight: 120, overflowY: 'auto' }}>
              {tools.length === 0 && <span className="muted" style={{ fontSize: 12 }}>No tools on your roster yet.</span>}
              {tools.slice(0, 24).map((t) => <span key={t.id} className="pill" style={{ fontSize: 11 }}>{t.name}{t.identifier ? ` (${t.identifier})` : ''}</span>)}
              {tools.length > 24 && <span className="pill muted" style={{ fontSize: 11 }}>+{tools.length - 24} more</span>}
            </div>
            <input value={missing} onChange={(e) => setMissing(e.target.value)} placeholder="Anything missing? (name/ID, comma-separated)" style={{ ...inp, marginTop: 9 }} />
            <button onClick={() => run(() => confirmTools(missing))} disabled={pending} className="btn" style={{ marginTop: 8 }}>{pending ? 'Saving…' : '✓ Confirm my tools'}</button>
          </div>
        )}
      </SectionShell>

      {/* 🤝 TODAY'S HELPER (info) */}
      <SectionShell icon="🤝" title="Today's Helper" sub={helper ? '' : 'No helper paired today'} green={false} required={false}>
        {helper && <div style={{ marginTop: 8, fontSize: 13 }}>Riding with <strong>{helper.helper_name || helper.lead_tech_name}</strong>{helper.status ? ` · ${helper.status}` : ''}. <span className="muted">Helper time attaches to each work order at cost — no markup.</span></div>}
      </SectionShell>

      {/* 📚 HANDBOOK RE-ACK */}
      <SectionShell icon="📚" title="Handbook Quarterly Re-Ack" sub={handbook.due ? (handbook.daysOverdue ? `${handbook.daysOverdue} days overdue` : 'due now') : `signed ${handbook.lastDays || 0}d ago`} green={g.handbook} required>
        {g.handbook ? (
          <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>✓ Signed for this quarter.</div>
        ) : (
          <div style={{ marginTop: 9 }}>
            <div className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>Quick recap — read before signing:</div>
            <div style={{ display: 'grid', gap: 4 }}>
              {HANDBOOK_RECAP.map(([s, t]) => <div key={s} style={{ fontSize: 12 }}><strong style={{ color: 'var(--amber)' }}>{s}</strong> — {t}</div>)}
            </div>
            <button onClick={() => run(() => ackHandbook())} disabled={pending} className="btn" style={{ marginTop: 10 }}>📝 Read &amp; Sign Now</button>
          </div>
        )}
      </SectionShell>

      {/* ⚖ KY CODE (reference) */}
      <SectionShell icon="⚖" title="KY Code reminders" sub="Per job — reference" green={false} required={false}>
        <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
          {KY_CODE.map(([h, t]) => <div key={h} style={{ fontSize: 12 }}><strong>{h}:</strong> <span className="muted">{t}</span></div>)}
        </div>
      </SectionShell>

      {msg && <div style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 8 }}>{msg}</div>}
    </div>
  );
}
