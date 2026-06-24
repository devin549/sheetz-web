import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { discordConfigured, discordReadConfigured } from '@/lib/discord';
import CommsDeskClient from './CommsDeskClient';

export const dynamic = 'force-dynamic';
const DELETE = ['owner', 'admin', 'gm', 'om'];

export default async function CommsDesk() {
  await requireHref('/messages');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Comms Desk</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await loadProfile(user) : null;
  const canDelete = !!profile && DELETE.includes(String(profile.role || '').toLowerCase());

  const sb = getSupabaseAdmin();
  let comms = [];
  // New columns (attachments/resolved) come with migration 61 — fall back gracefully.
  let res = await sb.from('cb_comms').select('id, channel, direction, to_addr, from_name, body, status, sent_by, created_at, resolved_at, attachments').is('deleted_at', null).order('created_at', { ascending: false }).limit(150);
  if (res.error) res = await sb.from('cb_comms').select('id, channel, direction, to_addr, from_name, body, status, sent_by, created_at').is('deleted_at', null).order('created_at', { ascending: false }).limit(150);
  if (res.error) res = await sb.from('cb_comms').select('id, channel, to_addr, body, status, sent_by, created_at').order('created_at', { ascending: false }).limit(150);
  if (!res.error) comms = res.data || [];

  // Team identities for avatars + Discord-name matching.
  let people = [];
  let pQ = await sb.from('techs').select('name, photo_url, discord_name, discord_user_id, position').limit(400);
  if (pQ.error) pQ = await sb.from('techs').select('name, position').limit(400);
  if (!pQ.error) people = (pQ.data || []).filter((p) => p.name);

  return (
    <div className="wrap" style={{ maxWidth: 880 }}>
      <div className="h1">Comms Desk</div>
      <p className="muted">What happened, who owns it, what needs done — built on the #sheetz feed (Captain Hook).</p>
      <CommsDeskClient comms={comms} people={people} discordReady={discordConfigured()} readReady={discordReadConfigured()} canDelete={canDelete} commsMissing={!!res.error} />
    </div>
  );
}
