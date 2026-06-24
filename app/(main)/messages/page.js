import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import { discordConfigured } from '@/lib/discord';
import MessagesClient from './MessagesClient';

export const dynamic = 'force-dynamic';

export default async function Messages() {
  await requireHref('/messages');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Messages</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  let comms = [];
  const res = await sb.from('cb_comms').select('id, channel, to_addr, body, status, sent_by, created_at').order('created_at', { ascending: false }).limit(80);
  if (!res.error) comms = res.data || [];

  return (
    <div className="wrap" style={{ maxWidth: 820 }}>
      <div className="h1">Messages</div>
      <p className="muted">Team alerts to #sheetz (Captain Hook) + the customer text/email history.</p>
      <MessagesClient comms={comms} discordReady={discordConfigured()} commsMissing={!!res.error} />
    </div>
  );
}
