'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { postToDiscord } from '@/lib/discord';
import { revalidatePath } from 'next/cache';

const MANAGE = ['owner', 'admin', 'gm', 'om', 'csr', 'dispatcher', 'marketing', 'sales', 'accounting', 'fs', 'foreman'];

async function gate() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await loadProfile(user) : null;
  if (!user || !profile || profile.active === false || !MANAGE.includes(String(profile.role || '').toLowerCase())) return null;
  return { sb: getSupabaseAdmin(), who: profile.name || user.email };
}

// Broadcast a team message to #sheetz (Discord) — and log it to the comms feed.
export async function postTeamMessage(formData) {
  const g = await gate();
  if (!g) return { ok: false, msg: 'Your role can’t post here.' };
  if (!g.sb) return { ok: false, msg: 'Server not configured.' };
  const text = String(formData.get('text') || '').trim().slice(0, 1500);
  if (!text) return { ok: false, msg: 'Write a message.' };

  const r = await postToDiscord(`💬 ${g.who}: ${text}`);
  try { await g.sb.from('cb_comms').insert({ channel: 'discord', direction: 'out', to_addr: '#sheetz', body: text, status: r.ok ? 'sent' : 'failed', error: r.ok ? null : r.error, sent_by: g.who }); } catch (_) {}
  revalidatePath('/messages');
  return r.ok ? { ok: true, msg: 'Posted to #sheetz.' } : { ok: false, msg: 'Discord: ' + r.error };
}
