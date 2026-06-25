'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';
  // A failed/expired reset link bounces back here — show a clear retry message instead of a raw error.
  const linkErr = params.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState(linkErr ? 'That reset link expired or was already used. Enter your email below and tap “Forgot password” for a fresh one — then click it right away.' : '');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true); setErr(''); setNote('');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) { setErr(error.message || 'Sign-in failed.'); setBusy(false); return; }
    router.push(next.startsWith('/') ? next : '/');
    router.refresh();
  }

  async function onForgot() {
    setErr(''); setNote('');
    if (!email.trim()) { setErr('Enter your email above first, then tap reset.'); return; }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/auth/reset` });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setNote(`✓ If ${email.trim()} has an account, a reset link is on the way. Open it on this device.`);
  }

  const input = {
    width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)',
    border: '1px solid var(--border)', color: 'var(--fg-1)', padding: '13px 14px',
    borderRadius: 9, fontSize: 16, outline: 'none', marginBottom: 12,
  };

  return (
    <div className="wrap" style={{ maxWidth: 380, marginTop: 40 }}>
      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: 46 }}>🚐</div>
        <div className="h1" style={{ margin: '4px 0' }}>Sheetz</div>
        <div className="muted">Clog Busterz · sign in</div>
      </div>

      <form onSubmit={onSubmit} className="card card-amber">
        <label className="muted" style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Email</label>
        <input type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@clogbusterzplumbing.com" style={input} />
        <label className="muted" style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Password</label>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" style={input} />
        {err && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 10 }}>{err}</div>}
        {note && <div style={{ color: 'var(--green-bright)', fontSize: 13, marginBottom: 10 }}>{note}</div>}
        <button className="btn" type="submit" disabled={busy} style={{ width: '100%', padding: 14, opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Signing in…' : 'Sign in →'}
        </button>
        <button type="button" onClick={onForgot} disabled={busy} style={{ width: '100%', marginTop: 10, background: 'none', border: 'none', color: 'var(--amber)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          Forgot password? Email me a reset link
        </button>
      </form>

      <div className="muted" style={{ textAlign: 'center', marginTop: 14, fontSize: 11 }}>
        Still stuck? Ask Devin to reset your access.
      </div>
    </div>
  );
}

export default function Login() {
  return (
    <Suspense fallback={<div className="wrap" style={{ maxWidth: 380, marginTop: 40 }}><div className="muted">Loading…</div></div>}>
      <LoginForm />
    </Suspense>
  );
}
