import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { roleOf } from '@/lib/nav';
import Sidebar from './Sidebar';

// Auth-gated group — always rendered per-request (never statically prerendered at build).
export const dynamic = 'force-dynamic';

export default async function MainLayout({ children }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const role = roleOf(user);
  const name = (user.user_metadata && user.user_metadata.name) || user.email;

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 'calc(100vh - 58px)' }}>
      <Sidebar role={role} name={name} />
      <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
    </div>
  );
}
