'use client';

// Tech iPad Settings — ported from the Apps Script SPA `pane-settings`. Sections: Profile (read-only),
// Appearance (theme + reduce-motion), Notifications, the 🔥 daily ROAST LEVEL (PG/PG-13/R, pick-once-lock,
// owner/GM override), Resources, Help, Danger Zone. iPad-first: cream/gold, compact rows, big tap targets.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setRoastLevel, unlockRoastLevel, savePrefs, reportLostDevice } from './actions';
import { ROAST_LEVELS } from '@/lib/roast';
import { createClient } from '@/lib/supabase/client';
import ChangePassword from './ChangePassword';
import RoastRConsent from '../RoastRConsent';

function Section({ title, children }) {
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}
function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid var(--border)' }}>
      <span style={{ flex: 1, fontSize: 14, color: 'var(--fg-1)' }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--fg-3)', display: 'flex', alignItems: 'center', gap: 8 }}>{children}</span>
    </div>
  );
}
function Toggle({ on, onClick }) {
  return (
    <button onClick={onClick} aria-pressed={on} style={{ width: 42, height: 24, borderRadius: 999, border: 'none', cursor: 'pointer', position: 'relative',
      background: on ? 'var(--green)' : 'var(--surface-3)', transition: 'background .15s' }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
    </button>
  );
}

const dangerGrey = { background: 'var(--surface-3)', color: 'var(--fg-1)', border: '1px solid var(--border-strong)', padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' };
const dangerRed = { background: 'var(--red)', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' };

const NOTIFS = [
  ['notif_newjob', 'New job assigned'],
  ['notif_checkin', '10-min check-in prompt'],
  ['notif_chat_urgent', 'Chat messages (urgent)'],
  ['notif_chat_normal', 'Chat messages (normal)'],
  ['notif_reviews', 'Customer reviews'],
  ['notif_pay', 'Pay alerts (deductions, bonuses)'],
  ['notif_races', 'Race alerts (leaderboard)'],
];
const RESOURCES = [
  ['CB Handbook', '/handbook'],
  ['Training videos', '/training'],
  ["Plumber's Brain", '/hank'],
];

export default function AccountSettings({ user, profile, isManager, theme: initialTheme }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const [level, setLevel] = useState(profile.roastLevel || 'PG');
  const [locked, setLocked] = useState(!!profile.roastLocked);
  const [prefs, setPrefs] = useState(profile.prefs || {});
  const [theme, setThemeState] = useState(initialTheme);
  const [showReset, setShowReset] = useState(false);

  const reportLost = () => {
    if (!window.confirm('Report this iPad lost or stolen? You will be signed out now and the office will be alerted to lock it.')) return;
    start(async () => { const r = await reportLostDevice(); flash(r); if (r.ok) { setTimeout(() => { window.location.href = '/login'; }, 900); } });
  };

  // Send the real Supabase reset email (lands on /auth/reset to set a new password).
  const requestReset = () => start(async () => {
    const sb = createClient();
    const { error } = await sb.auth.resetPasswordForEmail(user.email, { redirectTo: `${window.location.origin}/auth/reset` });
    flash(error ? { ok: false, msg: error.message } : { ok: true, msg: `✓ Reset link sent to ${user.email}.` });
  });

  const flash = (r) => { setMsg(r); if (r?.ok) setTimeout(() => setMsg(null), 1800); };

  const [rConsent, setRConsent] = useState(false);
  const commitLevel = (lvl, rAccepted) => start(async () => {
    const r = await setRoastLevel(lvl, { rAccepted });
    if (r.needsRConsent) { setRConsent(true); return; }
    flash(r); if (r.ok) { setLevel(lvl); setLocked(true); setRConsent(false); }
  });
  const pickLevel = (lvl) => {
    if (locked && !isManager) return;
    if (lvl === 'R') { setRConsent(true); return; } // R always needs the re-consent first
    commitLevel(lvl, false);
  };
  const unlock = () => start(async () => { const r = await unlockRoastLevel(); flash(r); if (r.ok) setLocked(false); });

  const notifOn = (k) => prefs[k] !== false; // default on
  const toggleNotif = (k) => { const next = { ...prefs, [k]: !notifOn(k) }; setPrefs(next); start(async () => { await savePrefs({ [k]: next[k] }); }); };

  const reduceMotion = prefs.reduce_motion === true;
  const toggleReduceMotion = () => {
    const v = !reduceMotion; setPrefs((p) => ({ ...p, reduce_motion: v }));
    document.documentElement.classList.toggle('cb-reduce-motion', v);
    start(async () => { await savePrefs({ reduce_motion: v }); });
  };

  const setTheme = (t) => {
    setThemeState(t);
    document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
    document.cookie = `theme=${t}; path=/; max-age=31536000`;
    router.refresh();
  };

  return (
    <div className="wrap" style={{ maxWidth: 640 }}>
      <div className="h1" style={{ marginBottom: 2 }}>⚙ Settings</div>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>{profile.name} · <strong style={{ color: profile.roleColor }}>{profile.roleLabel}</strong> · {user.email}</p>

      {/* 👤 PROFILE */}
      <Section title="👤 Profile">
        <Row label="Name">{profile.name || '—'}</Row>
        <Row label="Email">{user.email}</Row>
        <Row label="Role"><span style={{ color: profile.roleColor, fontWeight: 700 }}>{profile.roleLabel}</span></Row>
        {profile.tech_id && <Row label="Tech ID">{profile.tech_id}</Row>}
        {profile.payType && <Row label="Pay type">{profile.payType}</Row>}
      </Section>

      {/* 🎨 APPEARANCE */}
      <Section title="🎨 Appearance">
        <Row label="Theme">
          <span style={{ display: 'flex', gap: 6 }}>
            {[['dark', '🌙 Dark'], ['light', '☀ Light']].map(([id, lbl]) => (
              <button key={id} onClick={() => setTheme(id)} style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
                border: '1px solid ' + (theme === id ? 'var(--amber)' : 'var(--border-strong)'), background: theme === id ? 'var(--amber)' : 'var(--surface-2)', color: theme === id ? '#1a1206' : 'var(--fg-2)' }}>{lbl}</button>
            ))}
          </span>
        </Row>
        <Row label="Reduce motion"><Toggle on={reduceMotion} onClick={toggleReduceMotion} /></Row>
      </Section>

      {/* 🔔 NOTIFICATIONS + 🔥 ROAST LEVEL */}
      <Section title="🔔 Notifications">
        {NOTIFS.map(([k, lbl]) => <Row key={k} label={lbl}><Toggle on={notifOn(k)} onClick={() => toggleNotif(k)} /></Row>)}

        {/* 🔥 Daily roast level — pick once then locks (HR-safe). Owner/GM can override/unlock. */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>🔥 Daily roast level</span>
            {locked && <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--amber)', letterSpacing: '.5px' }}>🔒 LOCKED</span>}
            {isManager && <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--fg-3)' }}>manager — you can change any level</span>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {ROAST_LEVELS.map((r) => {
              const active = level === r.id;
              const disabled = locked && !isManager && !active;
              return (
                <button key={r.id} onClick={() => pickLevel(r.id)} disabled={disabled || pending} title={r.blurb}
                  style={{ flex: 1, padding: '10px 6px', borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'center',
                    border: '1px solid ' + (active ? 'var(--amber)' : 'var(--border-strong)'),
                    background: active ? 'var(--amber)' : 'var(--surface-2)', color: active ? '#1a1206' : 'var(--fg-2)', opacity: disabled ? 0.5 : 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{r.id}</div>
                  <div style={{ fontSize: 9, marginTop: 1, color: active ? '#1a1206' : 'var(--fg-3)' }}>{r.blurb}</div>
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 10, color: 'var(--fg-3)', lineHeight: 1.5, marginTop: 8 }}>
            Pick once — then it locks (keeps it HR-safe). <strong style={{ color: 'var(--fg-2)' }}>PG</strong> = clean ribbing · <strong style={{ color: 'var(--fg-2)' }}>PG-13</strong> = some bite · <strong style={{ color: 'var(--red)' }}>R</strong> = no mercy, thick skin required. Always about your <em>work</em>, never about you. <strong>Never shown to customers.</strong>
            {isManager && locked && <> · <button onClick={unlock} style={{ background: 'none', border: 'none', color: 'var(--amber)', cursor: 'pointer', fontWeight: 700, textDecoration: 'underline', fontSize: 10, padding: 0 }}>Unlock for re-pick</button></>}
          </div>
        </div>
      </Section>

      {/* 📚 RESOURCES */}
      <Section title="📚 Resources">
        {RESOURCES.map(([lbl, href]) => <Row key={lbl} label={lbl}><a href={href} style={{ color: 'var(--blue)' }}>Open →</a></Row>)}
      </Section>

      {/* 🚨 DANGER ZONE — matches the HTML Settings pane */}
      <Section title="🚨 Danger Zone">
        <Row label="Sign out (preserves data)">
          <form action="/auth/signout" method="post"><button type="submit" style={dangerGrey}>Sign Out</button></form>
        </Row>
        <Row label="Reset password">
          <button onClick={requestReset} disabled={pending} style={dangerGrey}>Request Reset Code</button>
        </Row>
        <div className="muted" style={{ fontSize: 10, padding: '2px 0 4px' }}>
          Emails a reset link to <strong>{user.email}</strong> (open it on this device). Or <button onClick={() => setShowReset((v) => !v)} style={{ background: 'none', border: 'none', color: 'var(--amber)', cursor: 'pointer', fontWeight: 700, textDecoration: 'underline', fontSize: 10, padding: 0 }}>{showReset ? 'hide' : 'set a new password now'}</button>.
        </div>
        {showReset && <div style={{ paddingTop: 4, paddingBottom: 6 }}><ChangePassword /></div>}
        <Row label="Report lost / stolen iPad">
          <button onClick={reportLost} disabled={pending} style={dangerRed}>🚨 Report</button>
        </Row>
      </Section>

      <RoastRConsent open={rConsent} busy={pending} onCancel={() => setRConsent(false)} onAgree={() => commitLevel('R', true)} />

      {msg && <div style={{ position: 'fixed', bottom: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 100, padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, background: msg.ok ? 'var(--green)' : 'var(--red)', color: '#fff', boxShadow: '0 4px 14px rgba(0,0,0,.3)' }}>{msg.msg}</div>}
    </div>
  );
}
