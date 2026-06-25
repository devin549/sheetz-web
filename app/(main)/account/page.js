import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { loadProfile } from '@/lib/profile';
import { roleMeta, can } from '@/lib/roles';
import AccountSettings from './AccountSettings';

export const dynamic = 'force-dynamic';

export default async function Account() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const profile = await loadProfile(user);
  const meta = roleMeta(profile.role);
  const theme = cookies().get('theme')?.value || 'dark';

  return (
    <AccountSettings
      user={{ email: user.email, id: user.id }}
      profile={{
        name: profile.name, email: profile.email, role: profile.role, roleLabel: meta.label, roleColor: meta.color,
        tech_id: profile.tech_id, payType: profile.prefs?.pay_type || null,
        roastLevel: profile.roastLevel, roastLocked: profile.roastLocked, prefs: profile.prefs || {},
      }}
      isManager={can(profile.role, 'manageUsers')}
      theme={theme}
    />
  );
}
