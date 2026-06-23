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
    </div>
  );
}
