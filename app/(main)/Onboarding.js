'use client';

// Tech onboarding GATE — full-screen, blocks the whole app until the tech clears Monitoring Disclosure →
// Handbook (initials) → NDA (initials) → Roast rating. R requires the separate thick-skin re-consent.
// Ported from the Apps Script iPad (monitorModal / onboardModal / roastRModal). Every acceptance is
// server-timestamped into policy_acks on Finish. iPad-first: cream/gold, big tap targets.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { completeOnboarding, emailMeDoc } from './onboardingActions';

const cardStyle = { background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' };
const initInput = { width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', padding: '12px', borderRadius: 8, fontSize: 18, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 4, fontFamily: "'JetBrains Mono',monospace" };
const primaryBtn = { width: '100%', padding: 15, borderRadius: 11, border: 'none', background: 'var(--amber)', color: '#1a1206', fontSize: 16, fontWeight: 800, cursor: 'pointer' };

export default function Onboarding({ name, handbookUrl = '', ndaUrl = '' }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [docMsg, setDocMsg] = useState({});     // per-doc "Sent ✓" / error feedback
  const [docBusy, setDocBusy] = useState('');
  const [accessed, setAccessed] = useState({}); // per-doc: opened OR emailed → unlocks the signature
  const [step, setStep] = useState(0);          // 0 monitoring · 1 handbook · 2 nda · 3 roast

  // Read it / email me a copy. The employee must do ONE of these (open or request the doc) before they can
  // sign — you can't agree to something you never saw. Either action unlocks the initials + Sign button.
  const markAccessed = (which) => setAccessed((a) => ({ ...a, [which]: true }));
  const emailDoc = (which) => { setDocBusy(which); setDocMsg((m) => ({ ...m, [which]: null })); emailMeDoc(which).then((r) => { setDocBusy(''); setDocMsg((m) => ({ ...m, [which]: r })); if (r?.ok) markAccessed(which); }).catch(() => { setDocBusy(''); setDocMsg((m) => ({ ...m, [which]: { ok: false, msg: 'Try again.' } })); }); };
  const DocAccess = ({ which, url, label }) => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '0 0 10px' }}>
      {url
        ? <a href={url} target="_blank" rel="noreferrer" onClick={() => markAccessed(which)} style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber)', textDecoration: 'none', border: '1px solid var(--amber-dim)', borderRadius: 8, padding: '7px 11px' }}>📖 Read the {label} ↗</a>
        : <span className="muted" style={{ fontSize: 11 }}>Office will email you the full copy.</span>}
      <button type="button" onClick={() => emailDoc(which)} disabled={docBusy === which} style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-1)', background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '7px 11px', cursor: 'pointer', opacity: docBusy === which ? 0.6 : 1 }}>{docBusy === which ? 'Sending…' : '✉️ Email me a copy'}</button>
      {docMsg[which] && <span style={{ fontSize: 11.5, fontWeight: 700, color: docMsg[which].ok ? 'var(--green)' : 'var(--red)' }}>{docMsg[which].msg}</span>}
    </div>
  );
  const LockNote = ({ which, label }) => !accessed[which]
    ? <div style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 600, marginBottom: 8 }}>📖 Open or email yourself the {label} above before you sign.</div>
    : <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600, marginBottom: 8 }}>✓ {label} accessed — go ahead and sign.</div>;
  const [monitoring, setMonitoring] = useState(false);
  const [hb, setHb] = useState('');
  const [nda, setNda] = useState('');
  const [level, setLevel] = useState(null);
  const [rAccepted, setRAccepted] = useState(false);
  const [rOpen, setROpen] = useState(false);
  const [rCheck, setRCheck] = useState(false);
  const [err, setErr] = useState('');

  const first = String(name || 'there').trim().split(/\s+/)[0];
  const next = () => { setErr(''); setStep((s) => s + 1); };

  const pickLevel = (lvl) => {
    if (lvl === 'R') { setRCheck(false); setROpen(true); return; } // R needs the re-consent first
    setLevel(lvl); setRAccepted(false);
  };
  const agreeR = () => { if (!rCheck) return; setLevel('R'); setRAccepted(true); setROpen(false); };

  const finish = () => {
    setErr('');
    start(async () => {
      const r = await completeOnboarding({ monitoring, handbookInitials: hb, ndaInitials: nda, roastLevel: level, roastRAccepted: rAccepted });
      if (r.ok) router.refresh(); else setErr(r.msg || 'Something went wrong.');
    });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--bg)', overflowY: 'auto' }}>
      <div className="wrap" style={{ maxWidth: 560, paddingTop: 24, paddingBottom: 48 }}>
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 38 }}>🚐</div>
          <div className="h1" style={{ margin: '4px 0 2px' }}>Welcome, {first}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>A few one-time agreements before you roll. Step {step + 1} of 4.</div>
          <div style={{ display: 'flex', gap: 5, justifyContent: 'center', marginTop: 10 }}>
            {[0, 1, 2, 3].map((i) => <span key={i} style={{ width: 34, height: 5, borderRadius: 3, background: i <= step ? 'var(--amber)' : 'var(--surface-3)' }} />)}
          </div>
        </div>

        {/* STEP 0 · MONITORING DISCLOSURE (required — no decline) */}
        {step === 0 && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}><span style={{ fontSize: 26 }}>📋</span><h3 style={{ margin: 0, color: 'var(--amber)' }}>Monitoring Disclosure</h3></div>
            <p style={{ fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.7, marginTop: 0 }}>By using this iPad, you acknowledge that company devices, customer communications, and jobsite interactions may be <strong style={{ color: 'var(--fg-1)' }}>monitored, recorded, and analyzed</strong> by automated systems for:</p>
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 14px', fontSize: 12.5, color: 'var(--fg-1)', lineHeight: 1.9, margin: '10px 0' }}>
              ✓ Quality assurance<br />✓ Training &amp; operational coaching<br />✓ Customer protection<br />✓ Fraud prevention<br />✓ Policy compliance<br />✓ Performance review
            </div>
            <div style={{ background: 'rgba(255,179,0,0.06)', borderLeft: '3px solid var(--amber-dim)', padding: '8px 12px', fontSize: 11.5, color: 'var(--fg-2)', lineHeight: 1.7, borderRadius: '0 6px 6px 0', marginBottom: 12 }}>
              <strong style={{ color: 'var(--amber)' }}>Plain English:</strong> Calls you make to a customer via the iPad are recorded; texts are saved; video walkthroughs go to Drive; AI (Hank, Pete) reads transcripts. Recordings retained <strong>7 years</strong> per CB policy + KY one-party consent (KRS 526.010). Reviewers: Devin (Owner), Ronnie (GM), Field Supervisors, automated AI.
            </div>
            <div style={{ background: 'rgba(76,175,80,0.06)', border: '1px solid var(--green-bright)', borderRadius: 6, padding: 10, fontSize: 11.5, color: 'var(--green-bright)', marginBottom: 14 }}>✓ This was in the NDA you signed at hire. Re-affirmed each iPad activation per Handbook §17.</div>
            <button style={primaryBtn} onClick={() => { setMonitoring(true); next(); }}>✓ I Acknowledge</button>
            <div className="muted" style={{ fontSize: 10, textAlign: 'center', marginTop: 8 }}>No “decline” — this is required to use the iPad. Your acknowledgment is recorded.</div>
          </div>
        )}

        {/* STEP 1 · HANDBOOK */}
        {step === 1 && (
          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>1 · Employee Handbook</div>
            <p style={{ fontSize: 12.5, color: 'var(--fg-2)', lineHeight: 1.65 }}>I have read and agree to the current CB Employee Handbook — pay policy, callbacks, conduct, and monitoring (§17).</p>
            <DocAccess which="handbook" url={handbookUrl} label="Handbook" />
            <LockNote which="handbook" label="Handbook" />
            <label className="muted" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>Type your initials to sign</label>
            <input value={hb} onChange={(e) => setHb(e.target.value)} maxLength={4} placeholder="e.g. MS" disabled={!accessed.handbook} style={{ ...initInput, opacity: accessed.handbook ? 1 : 0.5 }} />
            <button style={{ ...primaryBtn, marginTop: 14, opacity: (hb.trim().length >= 2 && accessed.handbook) ? 1 : 0.5, cursor: (hb.trim().length >= 2 && accessed.handbook) ? 'pointer' : 'not-allowed' }} disabled={hb.trim().length < 2 || !accessed.handbook} onClick={next}>Sign &amp; continue →</button>
            <button onClick={() => setStep(0)} style={{ width: '100%', marginTop: 8, background: 'none', border: 'none', color: 'var(--fg-3)', fontSize: 12, cursor: 'pointer' }}>← back</button>
          </div>
        )}

        {/* STEP 2 · NDA */}
        {step === 2 && (
          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>2 · Non-Disclosure Agreement</div>
            <p style={{ fontSize: 12.5, color: 'var(--fg-2)', lineHeight: 1.65 }}>I agree to the CB NDA — customer data, pricing, recordings, and trade secrets stay confidential, on and off the clock.</p>
            <DocAccess which="nda" url={ndaUrl} label="NDA" />
            <LockNote which="nda" label="NDA" />
            <label className="muted" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>Type your initials to sign</label>
            <input value={nda} onChange={(e) => setNda(e.target.value)} maxLength={4} placeholder="e.g. MS" disabled={!accessed.nda} style={{ ...initInput, opacity: accessed.nda ? 1 : 0.5 }} />
            <button style={{ ...primaryBtn, marginTop: 14, opacity: (nda.trim().length >= 2 && accessed.nda) ? 1 : 0.5, cursor: (nda.trim().length >= 2 && accessed.nda) ? 'pointer' : 'not-allowed' }} disabled={nda.trim().length < 2 || !accessed.nda} onClick={next}>Sign &amp; continue →</button>
            <button onClick={() => setStep(1)} style={{ width: '100%', marginTop: 8, background: 'none', border: 'none', color: 'var(--fg-3)', fontSize: 12, cursor: 'pointer' }}>← back</button>
          </div>
        )}

        {/* STEP 3 · ROAST RATING */}
        {step === 3 && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><span style={{ fontSize: 22 }}>🔥</span><div style={{ fontSize: 13, fontWeight: 800 }}>3 · Pick your daily roast level</div></div>
            <p style={{ fontSize: 12, color: 'var(--fg-3)', lineHeight: 1.55, marginTop: 2 }}>Hank’s Start-of-Day coaching. Pick once — it locks (keeps it HR-safe). Always about your <em>work</em>, never about you, and never shown to customers.</p>
            <div style={{ display: 'flex', gap: 8, margin: '10px 0' }}>
              {[['PG', 'Clean ribbing'], ['PG-13', 'Some bite'], ['R', 'No mercy']].map(([id, blurb]) => {
                const active = level === id;
                return (
                  <button key={id} onClick={() => pickLevel(id)} style={{ flex: 1, padding: '14px 6px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                    border: '1px solid ' + (active ? (id === 'R' ? '#d32f2f' : 'var(--amber)') : 'var(--border-strong)'),
                    background: active ? (id === 'R' ? '#d32f2f' : 'var(--amber)') : 'var(--surface-2)', color: active ? '#fff' : 'var(--fg-2)' }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{id}</div>
                    <div style={{ fontSize: 9, marginTop: 1, color: active ? '#fff' : 'var(--fg-3)' }}>{blurb}</div>
                  </button>
                );
              })}
            </div>
            {level === 'R' && rAccepted && <div style={{ fontSize: 11, color: '#ff8a80', fontWeight: 700, marginBottom: 8 }}>🔥 R agreed — recorded on finish.</div>}
            {err && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 8 }}>{err}</div>}
            <button style={{ ...primaryBtn, opacity: level && !pending ? 1 : 0.5, cursor: level && !pending ? 'pointer' : 'not-allowed' }} disabled={!level || pending} onClick={finish}>{pending ? 'Saving…' : "✓ Finish — I'm ready"}</button>
            <button onClick={() => setStep(2)} style={{ width: '100%', marginTop: 8, background: 'none', border: 'none', color: 'var(--fg-3)', fontSize: 12, cursor: 'pointer' }}>← back</button>
          </div>
        )}
      </div>

      {/* 🔥 RATED R RE-CONSENT — second warning + explicit, timestamped agreement */}
      {rOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10002, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, overflowY: 'auto' }}>
          <div style={{ background: 'var(--surface-0)', border: '1px solid #d32f2f', borderRadius: 16, maxWidth: 520, width: '100%', maxHeight: '94vh', overflow: 'auto' }}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: 'linear-gradient(135deg,#3a0d0d 0%,#5a1414 100%)', borderRadius: '16px 16px 0 0' }}>
              <span style={{ fontSize: 26 }}>🔥</span>
              <div><h3 style={{ margin: 0, fontSize: 17, color: '#ffcdd2' }}>Rated R — read this first</h3><div style={{ fontSize: 11, color: '#ef9a9a' }}>No mercy. Real profanity. Thick skin required.</div></div>
            </div>
            <div style={{ padding: 18 }}>
              <div style={{ background: 'rgba(211,47,47,0.1)', border: '1px solid #d32f2f', borderRadius: 10, padding: '12px 14px', fontSize: 13, lineHeight: 1.55, color: 'var(--fg-1)', marginBottom: 12 }}>
                You picked <strong style={{ color: '#ff8a80' }}>R — ADULT HUMOR</strong>. The no-holds-barred level. It can drop the <strong>f-bomb</strong> (shown as f**k), plus <strong>shit, ass, bullshit, damn, hell</strong> — always aimed at your <em>work and your numbers</em>, never at you as a person, and <strong>NEVER</strong> shown to customers.
              </div>
              <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 11.5, color: 'var(--fg-2)', lineHeight: 1.6, marginBottom: 12 }}>
                <div style={{ fontWeight: 700, color: 'var(--fg-1)', marginBottom: 4 }}>Examples at R:</div>
                • “$0?! Are you f**king kidding me? A goose egg is a day you stole from the company.”<br />• “That van doesn’t drive itself — get your ass out there and put a number up.”<br />• “Numbers are bullshit today. Fix your shit and get back on the board.”
              </div>
              <div style={{ border: '2px solid #d32f2f', background: 'rgba(211,47,47,0.06)', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: 'var(--fg-2)', lineHeight: 1.55, marginBottom: 12 }}>
                <strong style={{ color: '#ff8a80' }}>⚠️ Off-limits at EVERY level:</strong> nothing about race, ethnicity, national origin, color, sex, sexual orientation, gender identity, age, religion, disability, pregnancy, veteran status, appearance, weight, or any other protected class. Ever.
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--fg-3)', lineHeight: 1.5, marginBottom: 14 }}>Roast content shows ONLY on your NDA-protected screen — never in a text, email, or anything a customer sees. You can drop back to PG-13 or PG any time by asking a manager, no penalty.</div>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', background: 'var(--surface-1)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: 12, marginBottom: 14 }}>
                <input type="checkbox" checked={rCheck} onChange={(e) => setRCheck(e.target.checked)} style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0, accentColor: '#d32f2f' }} />
                <span style={{ fontSize: 12.5, color: 'var(--fg-1)', lineHeight: 1.5, fontWeight: 700 }}>I’ve got thick skin. I understand R uses real profanity about my work, and I want it turned on.</span>
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setROpen(false)} style={{ flex: 1, background: 'var(--surface-1)', border: '1px solid var(--border-strong)', color: 'var(--fg-2)', padding: 13, borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Not now</button>
                <button onClick={agreeR} disabled={!rCheck} style={{ flex: 1.4, background: 'linear-gradient(135deg,#8a2020 0%,#d32f2f 100%)', border: 'none', color: '#fff', padding: 13, borderRadius: 10, fontSize: 13, fontWeight: 900, cursor: rCheck ? 'pointer' : 'not-allowed', opacity: rCheck ? 1 : 0.45 }}>I AGREE — turn on R</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
