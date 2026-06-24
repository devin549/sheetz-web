import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { discordConfigured, discordReadConfigured } from '@/lib/discord';
import MessagesClient from './MessagesClient';

export const dynamic = 'force-dynamic';
const DELETE = ['owner', 'admin', 'gm', 'om'];

export default async function Messages() {
  await requireHref('/messages');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Messages</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await loadProfile(user) : null;
  const canDelete = !!profile && DELETE.includes(String(profile.role || '').toLowerCase());

  const sb = getSupabaseAdmin();
  let comms = [];
  // Try with the new columns; fall back if the migration hasn't been run yet.
  let res = await sb.from('cb_comms').select('id, channel, direction, to_addr, from_name, body, status, sent_by, created_at').is('deleted_at', null).order('created_at', { ascending: false }).limit(120);
  if (res.error) res = await sb.from('cb_comms').select('id, channel, to_addr, body, status, sent_by, created_at').order('created_at', { ascending: false }).limit(120);
  if (!res.error) comms = res.data || [];

  return (
    <div className="wrap" style={{ maxWidth: 820 }}>
      <div className="h1">Messages</div>
      <p className="muted">Team alerts to #sheetz (Captain Hook) + the customer text/email history.</p>
      <MessagesClient comms={comms} discordReady={discordConfigured()} readReady={discordReadConfigured()} canDelete={canDelete} commsMissing={!!res.error} />
    </div>
  );
}
