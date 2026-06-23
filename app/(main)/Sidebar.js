'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { navFor } from '@/lib/nav';
import { roleMeta } from '@/lib/roles';

export default function Sidebar({ role, name }) {
  const path = usePathname();
  const items = navFor(role);
  const meta = roleMeta(role);
  const [open, setOpen] = useState(false);
  // close the mobile drawer whenever the route changes
  useEffect(() => { setOpen(false); }, [path]);

  const linkStyle = (active) => ({
    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 12px',
    borderRadius: 9, fontSize: 15, fontWeight: active ? 800 : 600,
    color: active ? '#1a1206' : 'var(--fg-2)',
    background: active ? 'var(--amber)' : 'transparent', textDecoration: 'none',
  });

  const Nav = (
    <>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
        {items.map((it) => {
          const active = it.href === '/' ? path === '/' : path.startsWith(it.href);
          return (
            <Link key={it.href} href={it.href} onClick={() => setOpen(false)} style={linkStyle(active)}>
              <span style={{ fontSize: 18 }}>{it.icon}</span><span>{it.label}</span>
            </Link>
          );
        })}
      </nav>
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        <div style={{ fontSize: 10, color: meta.color, marginBottom: 8 }}>{meta.label}</div>
        <form action="/auth/signout" method="post">
          <button type="submit" style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-3)', padding: '8px', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>Sign out</button>
        </form>
      </div>
    </>
  );

  return (
    <>
      {/* desktop rail */}
      <aside className="cb-rail" style={{ width: 160, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'linear-gradient(180deg, var(--surface-1), var(--bg))', display: 'flex', flexDirection: 'column', padding: '12px 8px' }}>
        {Nav}
      </aside>

      {/* mobile menu button (floating, thumb-reachable) */}
      <button className="cb-burger" onClick={() => setOpen(true)} aria-label="Open menu">☰</button>

      {/* mobile drawer */}
      {open && (
        <div className="cb-drawer-overlay" onClick={() => setOpen(false)}>
          <aside className="cb-drawer" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontWeight: 800, fontSize: 14 }}>Menu</span>
              <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: 'none', border: 0, color: 'var(--fg-2)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            {Nav}
          </aside>
        </div>
      )}
    </>
  );
}
