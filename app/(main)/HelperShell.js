'use client';

// THE HELPER PHONE — the most-limited field seat (CB_Dispatch_Helper_v1). A helper rides along and
// assists a tech; they are NOT a tech. Per Devin: phone-only, dead simple, and NO money/pricing/AR/
// payroll anywhere. So this shell deliberately drops everything the tech cockpit has — no pay ribbon,
// no races/record/vegas, no estimate/invoice/prices/parts tabs, no shop-issue, no office switch.
// Just: today's jobs (the paired tech's day), navigate, assist photos, chat, Hank, tools, settings.
// Bottom tab bar + big touch targets = thumb-first on a phone, not a squeezed desktop.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import Watermark from './Watermark';

// Helper-safe tabs only. Money, pricing, estimates, invoices, shop-issue are intentionally absent.
const TABS = [
  { icon: '🏠', label: 'Today', href: '/my-day' },
  { icon: '📸', label: 'Photos', href: '/photos-helper' },
  { icon: '💬', label: 'Chat', href: '/messages' },
  { icon: '🪠', label: 'Hank', href: '/hank' },
  { icon: '🚐', label: 'Tools', href: '/my-truck' },
  { icon: '⚙️', label: 'Set', href: '/account' },
];

export default function HelperShell({ name, activeJob = null, wmId = '', children }) {
  const path = usePathname();
  useEffect(() => { document.documentElement.classList.add('cb-tech'); return () => document.documentElement.classList.remove('cb-tech'); }, []);

  const today = new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const initials = String(name || 'Helper').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const wmLabel = `${name || 'Helper'} · ${wmId} · ${today} · CB CONFIDENTIAL`;
  // "Photos" tab points at the active job's photos, or a friendly pick-a-job nudge.
  const photosHref = activeJob ? `/job/${activeJob.id}/photos` : '/my-day';
  const active = (h) => h === '/photos-helper' ? /\/photos$/.test(path) : (path === h || path.startsWith(h + '/'));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%', maxWidth: 560, margin: '0 auto' }}>
      <Watermark label={wmLabel} />

      {/* ── HEADER — minimal ─────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'var(--surface-1)' }}>
        <div style={{ fontWeight: 800, color: 'var(--amber)', fontSize: 15 }}>⚡ CB Helper</div>
        <div className="muted" style={{ fontSize: 12 }}>{name}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="av" style={{ width: 30, height: 30, borderRadius: 999, background: 'var(--amber)', color: '#1a1206', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>{initials}</div>
          <form action="/auth/signout" method="post" style={{ display: 'inline' }}>
            <button type="submit" title="Sign out" style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-3)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 14, padding: '6px 11px', cursor: 'pointer' }}>🚪 Out</button>
          </form>
        </div>
      </div>

      {/* ── ACTIVE-JOB PIN — keeps the helper on the same job as the tech ── */}
      {activeJob && (
        <Link href={`/job/${activeJob.id}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: 'linear-gradient(135deg, #1a3a2a 0%, #0f2a1a 100%)', borderBottom: '1px solid #4caf50', color: '#a5d6a7', fontSize: 12.5, fontWeight: 700 }}>
          📌 <span style={{ color: '#fff' }}>{activeJob.customer || 'Active job'}</span>
          {activeJob.number ? <span style={{ fontWeight: 500 }}>· {activeJob.number}</span> : null}
          {activeJob.address ? <span style={{ color: '#7fbf9a', fontWeight: 500, fontSize: 11 }}>· 📍 {activeJob.address}</span> : null}
        </Link>
      )}

      {/* ── BODY ─────────────────────────────────────────────────── */}
      <main style={{ flex: 1, minWidth: 0, overflowY: 'auto', paddingBottom: 76 }}>{children}</main>

      {/* ── BOTTOM TAB BAR — thumb-first, fixed ─────────────────── */}
      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: 560, margin: '0 auto', display: 'flex', background: 'var(--surface-1)', borderTop: '1px solid var(--border)', padding: '4px 2px', zIndex: 40 }}>
        {TABS.map((t) => {
          const href = t.href === '/photos-helper' ? photosHref : t.href;
          const A = active(t.href);
          return (
            <Link key={t.label} href={href} title={t.label}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '8px 2px', textDecoration: 'none', borderRadius: 10,
                color: A ? 'var(--amber)' : 'var(--fg-3)', background: A ? 'var(--surface-2)' : 'transparent', fontSize: 10, fontWeight: A ? 800 : 600 }}>
              <span style={{ fontSize: 22 }}>{t.icon}</span>
              <span>{t.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
