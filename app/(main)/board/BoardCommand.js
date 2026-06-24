import Link from 'next/link';
import { can } from '@/lib/roles';
import { money } from './boardTokens';
import { Flame, TriangleAlert, Inbox, ClipboardCheck, DollarSign, PackageOpen, CircleCheck } from 'lucide-react';

// Today's Fire — what needs attention right now, assembled from live board + AR + stock data.
export default function BoardCommand({ fire, role }) {
  const showAR = can(role, 'seeFinancials');
  const items = [
    { key: 'late', icon: TriangleAlert, n: fire.late, label: 'running late', hot: fire.late > 0, tone: 'var(--red)' },
    { key: 'qa', icon: ClipboardCheck, n: fire.qa, label: 'need QA', hot: fire.qa > 0, tone: 'var(--amber)', href: '/supervisor/jobs' },
    { key: 'unassigned', icon: Inbox, n: fire.unassigned, label: 'unassigned', hot: fire.unassigned > 0, tone: 'var(--amber)' },
    showAR ? { key: 'ar', icon: DollarSign, n: money(fire.ar90), label: 'AR 90+', hot: fire.ar90 > 0, tone: 'var(--red)', href: '/past-due' } : null,
    { key: 'stock', icon: PackageOpen, n: fire.lowStock, label: 'low stock', hot: fire.lowStock > 0, tone: 'var(--amber)', href: '/shop' },
  ].filter(Boolean);
  const allClear = items.every((i) => !i.hot);

  return (
    <div className="card" style={{ marginTop: 10, borderTop: `2px solid ${allClear ? 'var(--green)' : 'var(--red)'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: allClear ? 0 : 10 }}>
        {allClear ? <CircleCheck size={16} style={{ color: 'var(--green)' }} /> : <Flame size={16} style={{ color: 'var(--red)' }} />}
        <span style={{ fontWeight: 800, fontSize: 13 }}>Today&apos;s Fire</span>
        <span className="muted" style={{ fontSize: 11 }}>{allClear ? '· all clear — nothing on fire' : '· needs attention now'}</span>
      </div>
      {!allClear && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {items.map((it) => {
            const Icon = it.icon;
            const inner = (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', borderRadius: 10, minWidth: 120, border: `1px solid ${it.hot ? it.tone : 'var(--border)'}`, background: it.hot ? `color-mix(in oklab, ${it.tone} 12%, var(--surface-1))` : 'var(--surface-1)' }}>
                <Icon size={18} style={{ color: it.hot ? it.tone : 'var(--fg-3)' }} />
                <div>
                  <div style={{ fontSize: 19, fontWeight: 800, fontFamily: 'var(--mono)', color: it.hot ? it.tone : 'var(--fg-3)', lineHeight: 1 }}>{it.n}</div>
                  <div className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.04em' }}>{it.label}</div>
                </div>
              </div>
            );
            return it.href ? <Link key={it.key} href={it.href} style={{ textDecoration: 'none' }}>{inner}</Link> : <div key={it.key}>{inner}</div>;
          })}
        </div>
      )}
    </div>
  );
}
