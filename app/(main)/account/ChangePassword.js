'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const inputStyle = {
  background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)',
  borderRadius: 8, padding: '10px 12px', fontSize: 15, width: '100%',
};

export default function ChangePassword() {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

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
    setPw(''); setPw2('');
    setMsg({ ok: true, t: '✓ Password changed. Use it next time you sign in.' });
  }

  return (
    <div className="card card-amber" style={{ maxWidth: 420 }}>
      <div style={{ fontWeight: 800, marginBottom: 4 }}>🔐 Change my password</div>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
        Set your own password so you’re not using the temp one you were given.
      </p>
      <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
          placeholder="New password" autoComplete="new-password" style={inputStyle} />
        <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)}
          placeholder="Type it again" autoComplete="new-password" style={inputStyle} />
        <div>
          <button type="submit" className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
        </div>
      </form>
      {msg && <div style={{ marginTop: 10, fontSize: 13, color: msg.ok ? 'var(--green-bright)' : 'var(--red)' }}>{msg.t}</div>}
    </div>
  );
}
