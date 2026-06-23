'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { navFor } from '@/lib/nav';

const ROLE_LABEL = { owner: 'Owner', office: 'Office', tech: 'Tech' };

export default function Sidebar({ role, name }) {
  const path = usePathname();
  const items = navFor(role);

  return (
    <aside
      style={{
        width: 160, flexShrink: 0, borderRight: '1px solid var(--border)',
        background: 'linear-gradient(180deg, var(--surface-1), var(--bg))',
        display: 'flex', flexDirection: 'column', padding: '12px 8px',
      }}
    >
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
        {items.map((it) => {
          const active = it.href === '/' ? path === '/' : path.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                borderRadius: 9, fontSize: 14, fontWeight: active ? 800 : 600,
                color: active ? '#1a1206' : 'var(--fg-2)',
                background: active ? 'var(--amber)' : 'transparent',
                textDecoration: 'none',
              }}
            >
              <span style={{ fontSize: 17 }}>{it.icon}</span>
              <span>{it.label}</span>
            </Link>
          );
        })}
      </nav>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        <div style={{ fontSize: 10, color: 'var(--amber)', marginBottom: 8 }}>{ROLE_LABEL[role] || role}</div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            style={{
              width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)',
              color: 'var(--fg-3)', padding: '7px', borderRadius: 7, fontSize: 11, cursor: 'pointer',
            }}
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
