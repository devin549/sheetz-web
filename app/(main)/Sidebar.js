'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { navGroupsFor } from '@/lib/nav';
import { roleMeta } from '@/lib/roles';
import {
  House, Truck, Calendar, ClipboardCheck, Phone, Sparkles, Users, Star, TriangleAlert,
  List, CircleCheck, Flag, Flame, Map, ChartColumn, SlidersHorizontal, Lock, ChevronDown,
} from 'lucide-react';

const ICONS = {
  home: House, truck: Truck, calendar: Calendar, clipboardCheck: ClipboardCheck, phone: Phone,
  sparkles: Sparkles, users: Users, star: Star, alert: TriangleAlert, list: List, check: CircleCheck,
  flag: Flag, flame: Flame, map: Map, chart: ChartColumn, sliders: SlidersHorizontal, lock: Lock,
};
const Icon = ({ name, size = 17 }) => { const C = ICONS[name] || List; return <C size={size} />; };

export default function Sidebar({ role, name }) {
  const path = usePathname();
  const { pinned, groups, account } = navGroupsFor(role);
  const meta = roleMeta(role);
  const [open, setOpen] = useState(false);            // mobile drawer
  const [openGroups, setOpenGroups] = useState({});   // collapsible groups
  useEffect(() => { setOpen(false); }, [path]);

  const isActive = (it) => it.status !== 'porting' && (it.href === '/' ? path === '/' : path.startsWith(it.href));
  const activeGroup = groups.find((g) => g.items.some((it) => isActive(it)));

  const row = (it) => {
    const active = isActive(it);
    const porting = it.status === 'porting';
    return (
      <Link key={it.key + it.href} href={it.href} onClick={() => setOpen(false)}
        style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 8, fontSize: 13.5,
          fontWeight: active ? 800 : 600, color: active ? '#1a1206' : porting ? 'var(--fg-3)' : 'var(--fg-2)',
          background: active ? 'var(--amber)' : 'transparent', textDecoration: 'none' }}>
        <Icon name={it.icon} /><span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
        {porting && <span style={{ fontSize: 8.5, fontWeight: 800, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.04em' }}>soon</span>}
      </Link>
    );
  };

  const Nav = (
    <>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {pinned.map(row)}

        {groups.map((g) => {
          const isOpen = openGroups[g.id] ?? (g.id === activeGroup?.id);
          return (
            <div key={g.id} style={{ marginTop: 6 }}>
              <button onClick={() => setOpenGroups((s) => ({ ...s, [g.id]: !isOpen }))}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'none', border: 0,
                  color: 'var(--fg-3)', cursor: 'pointer', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                <Icon name={g.icon} size={13} /><span style={{ flex: 1, textAlign: 'left' }}>{g.title}</span>
                <ChevronDown size={13} style={{ transform: isOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }} />
              </button>
              {isOpen && <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 4 }}>{g.items.map(row)}</div>}
            </div>
          );
        })}
      </nav>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 8 }}>
        {row(account)}
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 6 }}>{name}</div>
        <div style={{ fontSize: 10, color: meta.color, marginBottom: 8 }}>{meta.label}</div>
        <form action="/auth/signout" method="post">
          <button type="submit" style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-3)', padding: '8px', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>Sign out</button>
        </form>
      </div>
    </>
  );

  return (
    <>
      <aside className="cb-rail" style={{ width: 188, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'linear-gradient(180deg, var(--surface-1), var(--bg))', display: 'flex', flexDirection: 'column', padding: '12px 8px', height: '100vh', position: 'sticky', top: 0 }}>
        {Nav}
      </aside>

      <button className="cb-burger" onClick={() => setOpen(true)} aria-label="Open menu">☰</button>

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
