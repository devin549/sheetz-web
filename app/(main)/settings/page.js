import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import SettingsClient from './SettingsClient';

export const dynamic = 'force-dynamic';

export default async function Settings() {
  await requirePerm('manageUsers');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Settings</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('office_goals').select('key, label, target, unit, assignee, sort').order('sort');
  const missing = error && /could not find|does not exist|schema cache/i.test(error.message || '');

  return (
    <div className="wrap" style={{ maxWidth: 640 }}>
      <div className="h1">Settings</div>
      <p className="muted">Office goals — the targets the board&apos;s gauges + Game Plan measure against.</p>
      {missing
        ? <div className="notice">Goals need their table — run <code>supabase/34_goals.sql</code> in Supabase.</div>
        : error
          ? <div className="notice">Couldn’t load: {error.message}</div>
          : <SettingsClient goals={data || []} />}
    </div>
  );
}
