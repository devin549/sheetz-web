'use client';

// 📱 iPad bottom tab bar — thumb-reach nav so techs aren't "web surfing" a side menu. Primary tabs +
// a "More" sheet that opens the full rail. Shown on iPad/narrow widths (the side rail hides there);
// on desktop the side rail shows and this hides (CSS in globals.css). Never shown in customer view.
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const PRIMARY = [
  { icon: '🌅', label: 'Start', href: '/start' },
  { icon: '📋', label: 'My Day', href: '/my-day' },
  { icon: '💵', label: 'Pay', href: '/pay' },
  { icon: '🏁', label: 'Races', href: '/races' },
];

export default function BottomBar({ rail = [] }) {
  const path = usePathname() || '';
  const [more, setMore] = useState(false);
  const isActive = (href) => href === '/' ? path === '/' : (path === href || path.startsWith(href + '/'));

  const tab = (icon, label, on, onClick, href) => {
    const inner = (
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, color: on ? 'var(--amber)' : 'var(--fg-3)', fontWeight: on ? 800 : 600, fontSize: 10.5 }}>
        <span style={{ fontSize: 21, lineHeight: 1 }}>{icon}</span>{label}
      </span>
    );
    const style = { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '7px 0', textDecoration: 'none', minHeight: 52 };
    return onClick
      ? <button key={label} onClick={onClick} style={{ ...style, background: 'none', border: 'none', cursor: 'pointer' }}>{inner}</button>
      : <Link key={label} href={href} style={style}>{inner}</Link>;
  };

  return (
    <>
      <nav className="cb-bottombar" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 60, background: 'var(--surface-1)', borderTop: '1px solid var(--border)', paddingBottom: 'env(safe-area-inset-bottom, 0px)', boxShadow: '0 -2px 12px rgba(0,0,0,0.12)' }}>
        {PRIMARY.map((t) => tab(t.icon, t.label, isActive(t.href), null, t.href))}
        {tab('☰', 'More', more, () => setMore(true))}
      </nav>

      {/* More sheet — the full rail, thumb-reachable */}
      {more && (
        <>
          <div onClick={() => setMore(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 70 }} />
          <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 71, background: 'var(--surface-1)', borderTopLeftRadius: 16, borderTopRightRadius: 16, borderTop: '1px solid var(--border)', maxHeight: '70vh', overflowY: 'auto', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px 6px' }}>
              <strong style={{ fontSize: 14 }}>More</strong>
              <button onClick={() => setMore(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 20, color: 'var(--fg-3)', cursor: 'pointer' }}>×</button>
            </div>
            {rail.map((grp) => (
              <div key={grp.group} style={{ padding: '4px 12px 8px' }}>
                <div style={{ fontSize: 9, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700, padding: '4px 6px' }}>{grp.group}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  {grp.items.map((it) => (
                    <Link key={it.label} href={it.href} onClick={() => setMore(false)}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '12px 4px', borderRadius: 12, textDecoration: 'none', minHeight: 64,
                        background: isActive(it.href) ? 'var(--surface-2)' : 'transparent', color: isActive(it.href) ? 'var(--amber)' : 'var(--fg-2)', fontSize: 10.5, fontWeight: isActive(it.href) ? 800 : 600, position: 'relative' }}>
                      <span style={{ fontSize: 22 }}>{it.icon}</span>{it.label}
                      {it.badge && <span style={{ position: 'absolute', top: 6, right: 10, background: 'var(--red,#d32f2f)', color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 9, fontWeight: 800 }}>{it.badge}</span>}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
