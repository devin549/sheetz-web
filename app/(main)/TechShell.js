'use client';

// The FIELD shell chrome — NO office sidebar. A mobile-first bottom rail (the iPad rail, trimmed to the
// 5 thumb-reach tabs) + a header escape hatch for owner/GM to drop back to Office mode. "Job Cockpit, not
// desktop My Day": the cockpit screens live under these tabs; this is just the field-app frame around them.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calendar, DollarSign, Sparkles, Truck, User, Briefcase } from 'lucide-react';

const TABS = [
  { href: '/my-day', label: 'Today', icon: Calendar },
  { href: '/pay', label: 'Pay', icon: DollarSign },
  { href: '/hank', label: 'Hank', icon: Sparkles },
  { href: '/my-truck', label: 'Tools', icon: Truck },
  { href: '/account', label: 'Me', icon: User },
];

function switchShell(s) {
  document.cookie = `cb_shell=${s}; path=/; max-age=${60 * 60 * 24 * 365}`;
  window.location.href = s === 'office' ? '/' : s === 'shop' ? '/shop' : '/my-day';
}

export default function TechShell({ name, shells = ['tech'], children }) {
  const path = usePathname();
  const active = (h) => path === h || path.startsWith(h + '/');
  const canOffice = shells.includes('office');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 58px)', width: '100%' }}>
      {canOffice && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface-1)' }}>
          <span className="muted" style={{ fontSize: 11, fontWeight: 700 }}>🔧 Field mode</span>
          <button onClick={() => switchShell('office')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: 'var(--fg-2)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>
            <Briefcase size={13} /> Office mode
          </button>
        </div>
      )}

      <main style={{ flex: 1, minWidth: 0, paddingBottom: 68 }}>{children}</main>

      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, display: 'flex', borderTop: '1px solid var(--border)', background: 'var(--surface-1)', zIndex: 30 }}>
        {TABS.map((t) => {
          const A = active(t.href); const I = t.icon;
          return (
            <Link key={t.href} href={t.href} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '9px 0', textDecoration: 'none', color: A ? 'var(--amber)' : 'var(--fg-3)', fontWeight: A ? 800 : 600, fontSize: 10.5 }}>
              <I size={20} /><span>{t.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
