'use client';

// Promote online booking — the tech shares a link to the new CB site's booking page with their referral
// code baked in (?ref=CODE), so an online booking auto-attributes the $15/$15 to them.
import { useState } from 'react';

export default function BookingPromo({ url, code }) {
  const [copied, setCopied] = useState(false);
  const msg = `Book Clog Busterz Plumbing online in 60 seconds 👉 ${url}${code ? ` — use my code ${code} for $15 off your first paid job.` : ''}`;
  const copy = () => { try { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (_) {} };
  const share = () => { if (navigator.share) navigator.share({ text: msg, url }).catch(() => {}); else copy(); };
  return (
    <div className="card" style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 18 }}>🌐</span>
        <span style={{ fontWeight: 800 }}>Book online — share your link</span>
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Send the customer your booking link. They book in 60 seconds and your referral code rides along automatically.</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: 'var(--amber)', wordBreak: 'break-all', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>{url}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button onClick={copy} className="btn btn-ghost" style={{ flex: 1, minWidth: 120 }}>{copied ? '✓ Copied' : '🔗 Copy link'}</button>
        <button onClick={share} className="btn" style={{ flex: 1, minWidth: 120 }}>📲 Share link</button>
        <a href={url} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ flex: 1, minWidth: 120, textAlign: 'center' }}>↗ Preview</a>
      </div>
    </div>
  );
}
