import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { roleOf } from '@/lib/nav';
import { roleMeta } from '@/lib/roles';
import ChangePassword from './ChangePassword';

export const dynamic = 'force-dynamic';

export default async function Account() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const meta = roleMeta(roleOf(user));
  const name = (user.user_metadata && user.user_metadata.name) || user.email;

  return (
    <div className="wrap">
      <div className="h1">🔐 Account</div>
      <p className="muted">
        {name} · <strong style={{ color: meta.color }}>{meta.label}</strong> · {user.email}
      </p>
      <ChangePassword />

      <form action="/auth/signout" method="post" style={{ marginTop: 18 }}>
        <button type="submit" className="btn" style={{ background: 'var(--surface-2)', color: 'var(--fg-1)', border: '1px solid var(--border-strong)' }}>🚪 Sign out</button>
      </form>
    </div>
  );
}
