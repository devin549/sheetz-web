import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { loadProfile } from '@/lib/profile';
import { roleMeta, can } from '@/lib/roles';
import { ccGated } from '@/lib/ccPin';
import AccountSettings from './AccountSettings';

export const dynamic = 'force-dynamic';

export default async function Account() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const profile = await loadProfile(user);
  const meta = roleMeta(profile.role);
  const theme = cookies().get('theme')?.value || 'dark';
  // Field crew (own-only techs/helpers + crew leads) MUST share location while working — locked on, can't
  // toggle off. Managers/office are exempt. (Note: the OS-level permission is still the tech's; this just
  // removes the easy in-app off-switch — accountability comes from dark-detection, not this lock alone.)
  const lockLocation = (can(profile.role, 'seeOwnOnly') || can(profile.role, 'seeCrew')) && !can(profile.role, 'manageUsers');

  return (
    <AccountSettings
      user={{ email: user.email, id: user.id }}
      profile={{
        name: profile.name, email: profile.email, role: profile.role, roleLabel: meta.label, roleColor: meta.color, photoUrl: profile.photoUrl, homeAddress: profile.homeAddress,
        tech_id: profile.tech_id, payType: profile.prefs?.pay_type || null, phone: profile.phone,
        roastLevel: profile.roastLevel, roastLocked: profile.roastLocked, prefs: profile.prefs || {},
        licenseReady: profile.licenseReady, licenseOnFile: profile.licenseOnFile, licenseExpiry: profile.licenseExpiry, licenseState: profile.licenseState,
      }}
      isManager={can(profile.role, 'manageUsers')}
      lockLocation={lockLocation}
      ccGated={ccGated(profile.role) && profile.ccPinReady}
      ccPinSet={profile.ccPinSet}
      ipadPinReady={profile.ipadPinReady}
      ipadPinSet={profile.ipadPinSet}
      theme={theme}
    />
  );
}
