'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { pairReader, setDefaultReader, unpairReader } from './actions';

const input = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14, width: '100%' };

export default function CardReaders({ readers, stripeReady, needsMig }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [msg, setMsg] = useState(null);
  const [pending, start] = useTransition();

  const run = (fn) => start(async () => { const r = await fn(); setMsg(r); if (r.ok) router.refresh(); });
  const pair = () => { const fd = new FormData(); fd.set('code', code); fd.set('label', label); run(async () => { const r = await pairReader(fd); if (r.ok) { setCode(''); setLabel(''); } return r; }); };

  return (
    <div className="wrap" style={{ maxWidth: 720 }}>
      <div className="h1">💳 Card Readers</div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Pair a Stripe <strong>WisePOS E</strong> so techs can tap/insert a card at job close-out. The reader talks to Stripe directly — no card data passes through the app.</div>

      {!stripeReady && <div className="notice" style={{ marginBottom: 12 }}>Add <code>STRIPE_SECRET_KEY</code> in Vercel before pairing.</div>}
      {needsMig && <div className="notice" style={{ marginBottom: 12 }}>Run <code>supabase/123_terminal_readers.sql</code> in Supabase first.</div>}

      <div className="card">
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Pair a new reader</div>
        <ol className="muted" style={{ fontSize: 12.5, margin: 0, paddingLeft: 18, marginBottom: 10 }}>
          <li>On the WisePOS E: <strong>Settings → Generate pairing code</strong> (a 3-word code appears).</li>
          <li>Type that code below + a name, then Pair.</li>
        </ol>
        <div style={{ display: 'grid', gap: 8 }}>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Reader name (e.g. Van 7)" style={input} autoComplete="off" />
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Pairing code (e.g. quick-brown-fox)" style={input} autoComplete="off" />
          <button onClick={pair} disabled={pending || !code.trim() || !stripeReady} className="btn" style={{ opacity: (pending || !code.trim() || !stripeReady) ? 0.55 : 1 }}>{pending ? 'Pairing…' : 'Pair reader'}</button>
        </div>
        {msg && <div style={{ fontSize: 13, fontWeight: 700, marginTop: 10, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Paired readers ({readers.length})</div>
        {readers.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>None yet. Pair one above — the first becomes the shop default automatically.</div>
        ) : readers.map((r) => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{r.label || r.id} {r.is_default && <span className="pill" style={{ color: 'var(--green)', marginLeft: 6 }}>default</span>}</div>
              <div className="muted" style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace" }}>{r.id}{r.tech_name ? ` · ${r.tech_name}` : ''}</div>
            </div>
            {!r.is_default && <button onClick={() => run(() => setDefaultReader(r.id))} disabled={pending} className="btn btn-ghost" style={{ fontSize: 12 }}>Make default</button>}
            <button onClick={() => run(() => unpairReader(r.id))} disabled={pending} className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--red)' }}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}
