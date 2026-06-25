'use client';

// Password-reset landing page. The tech arrives here from the reset link Supabase emailed (Settings →
// Request Reset Code, or login → Forgot password). The link carries a recovery code; the browser client
// (which holds the PKCE verifier) exchanges it for a short-lived recovery session, then the tech sets a
// new password via updateUser. Same-device flow (open the email on the iPad you requested from) is the
// happy path. Cross-device PKCE can't carry the verifier — we show a clear fallback message.
import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function ResetInner() {
  const router = useRouter();
  const [phase, setPhase] = useState('checking'); // checking | ready | nolink | done
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    const sb = createClient();
    let cancelled = false;
    (async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');
        if (code) { try { await sb.auth.exchangeCodeForSession(code); } catch (_) {} }
        // detectSessionInUrl also handles the implicit (#access_token) variant automatically.
        const { data } = await sb.auth.getSession();
        if (cancelled) return;
        setPhase(data?.session ? 'ready' : 'nolink');
      } catch { if (!cancelled) setPhase('nolink'); }
    })();
    return () => { cancelled = true; };
  }, []);

  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    if (pw.length < 8) { setMsg({ ok: false, t: 'Use at least 8 characters.' }); return; }
    if (pw !== pw2) { setMsg({ ok: false, t: 'The two passwords don’t match.' }); return; }
    setBusy(true);
    const sb = createClient();
    const { error } = await sb.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { setMsg({ ok: false, t: error.message }); return; }
    setPhase('done');
    setTimeout(() => { router.push('/login'); }, 1600);
  }

  const input = { width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', padding: '13px 14px', borderRadius: 9, fontSize: 16, outline: 'none', marginBottom: 12 };

  return (
    <div className="wrap" style={{ maxWidth: 380, marginTop: 40 }}>
      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: 46 }}>🔑</div>
        <div className="h1" style={{ margin: '4px 0' }}>Set a new password</div>
      </div>

      {phase === 'checking' && <div className="card"><span className="muted">Checking your reset link…</span></div>}

      {phase === 'nolink' && (
        <div className="card card-amber">
          <strong>This reset link isn’t active.</strong>
          <p className="muted" style={{ fontSize: 13 }}>Open the link from the reset email on the <em>same device</em> you requested it from, and make sure it hasn’t expired. You can request a fresh one from the login screen.</p>
          <a className="btn" href="/login" style={{ display: 'inline-block' }}>Back to sign in</a>
        </div>
      )}

      {phase === 'ready' && (
        <form onSubmit={submit} className="card card-amber">
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Pick a new password — at least 8 characters.</p>
          <input type="password" autoComplete="new-password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password" style={input} />
          <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Type it again" style={input} />
          {msg && <div style={{ color: msg.ok ? 'var(--green-bright)' : 'var(--red)', fontSize: 13, marginBottom: 10 }}>{msg.t}</div>}
          <button className="btn" type="submit" disabled={busy} style={{ width: '100%', padding: 14, opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Save new password →'}</button>
        </form>
      )}

      {phase === 'done' && <div className="card card-amber"><strong style={{ color: 'var(--green-bright)' }}>✓ Password changed.</strong><p className="muted" style={{ fontSize: 13 }}>Taking you to sign in…</p></div>}
    </div>
  );
}

export default function ResetPage() {
  return <Suspense fallback={<div className="wrap" style={{ maxWidth: 380, marginTop: 40 }}><div className="muted">Loading…</div></div>}><ResetInner /></Suspense>;
}
