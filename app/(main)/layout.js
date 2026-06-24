import { redirect } from 'next/navigation';
import { headers, cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { resolveShell, switchableShells } from '@/lib/shells';
import Sidebar from './Sidebar';

// Auth-gated group — always rendered per-request (never statically prerendered at build).
export const dynamic = 'force-dynamic';

export default async function MainLayout({ children }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const profile = await loadProfile(user);
  const role = profile.role;
  const name = profile.name || user.email;

  // Shell = subdomain (when live) → else the cookie override → else the role default.
  const host = headers().get('host') || '';
  const cookieShell = cookies().get('cb_shell')?.value || '';
  const shell = resolveShell({ host, cookieShell, role, fieldMode: profile.fieldMode, shopMode: profile.shopMode });
  const shells = switchableShells({ role, fieldMode: profile.fieldMode, shopMode: profile.shopMode });

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 'calc(100vh - 58px)' }}>
      <Sidebar role={role} name={name} shell={shell} shells={shells} />
      <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
    </div>
  );
}
