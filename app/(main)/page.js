import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { roleOf, navFor } from '@/lib/nav';

export const dynamic = 'force-dynamic';

const ROLE_LABEL = { owner: 'Owner', office: 'Office', tech: 'Tech' };

export default async function Home() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const role = roleOf(user);
  const fullName = (user && user.user_metadata && user.user_metadata.name) || (user && user.email) || '';
  const first = String(fullName).split(/[\s@]/)[0] || 'there';
  const items = navFor(role).filter((n) => n.href !== '/');

  return (
    <div className="wrap">
      <div className="h1">Welcome, {first} 👋</div>
      <p className="muted">
        Signed in as <strong style={{ color: 'var(--amber)' }}>{ROLE_LABEL[role] || role}</strong>. Pick a screen from the menu, or jump in:
      </p>

      <div style={{ margin: '18px 0', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {items.map((it) => (
          <Link key={it.href} className="btn" href={it.href}>{it.icon} {it.label} →</Link>
        ))}
      </div>

      <div className="card" style={{ marginTop: 8 }}>
        <div className="muted" style={{ fontSize: 13 }}>
          🚐 The Clog Busterz platform — your customers, your money, your field crew, all in one place.
          More screens (booking, dispatch board) are on the way.
        </div>
      </div>
    </div>
  );
}
