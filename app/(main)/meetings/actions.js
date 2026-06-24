'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { postToDiscord } from '@/lib/discord';
import { FIELD_POSITIONS } from '@/lib/positions';
import { requiredNames } from '@/lib/meetings';
import { revalidatePath } from 'next/cache';

// Who can SEND a meeting: field supervisor, GM, office manager, owner.
const SENDERS = ['owner', 'admin', 'gm', 'om', 'fs', 'foreman'];

async function me() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await loadProfile(user) : null;
  if (!user || !profile || profile.active === false) return null;
  return { user, profile, role: String(profile.role || '').toLowerCase(), name: profile.name || user.email, sb: getSupabaseAdmin() };
}
const clean = (v, n = 300) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);

export async function createMeeting(formData) {
  const g = await me();
  if (!g || !g.sb) return { ok: false, msg: 'Not signed in.' };
  if (!SENDERS.includes(g.role)) return { ok: false, msg: 'Only a supervisor, GM, office manager, or owner can send a meeting.' };
  const title = clean(formData.get('title'), 120);
  const date = clean(formData.get('date'), 10);     // yyyy-mm-dd
  const time = clean(formData.get('time'), 5);      // HH:MM
  const audience = clean(formData.get('audience'), 80) || 'everyone';
  if (!title) return { ok: false, msg: 'Give the meeting a title.' };
  if (!date || !time) return { ok: false, msg: 'Pick a date and time.' };
  const starts = new Date(`${date}T${time}`);
  if (Number.isNaN(starts.getTime())) return { ok: false, msg: 'Bad date/time.' };
  const row = {
    title, starts_at: starts.toISOString(), duration_min: Math.max(15, parseInt(formData.get('duration'), 10) || 60),
    location: clean(formData.get('location'), 160) || null, notes: clean(formData.get('notes'), 600) || null,
    audience, created_by: g.name, created_role: g.role,
  };
  const { data, error } = await g.sb.from('meetings').insert(row).select('id').single();
  if (error) return { ok: false, msg: /meetings|does not exist|schema cache/i.test(error.message) ? 'Run migration 63 first.' : error.message };

  const when = starts.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const aud = audience === 'everyone' ? 'everyone' : `${audience} crew`;
  await postToDiscord(`📅 MEETING — ${title}\n${when}${row.location ? ` @ ${row.location}` : ''}\nFor ${aud}. 👍 Acknowledge in the app → Meetings (and it adds to your calendar).`);
  revalidatePath('/meetings');
  return { ok: true, msg: 'Meeting sent — crew must acknowledge.' };
}

// A person taps 👍 — records their acknowledgment. The calendar link is built client-side on tap.
export async function acknowledgeMeeting(meetingId) {
  const g = await me();
  if (!g || !g.sb) return { ok: false, msg: 'Not signed in.' };
  if (!meetingId) return { ok: false, msg: 'No meeting.' };
  const { error } = await g.sb.from('meeting_acks').upsert({ meeting_id: meetingId, tech_name: g.name }, { onConflict: 'meeting_id,tech_name' });
  if (error) return { ok: false, msg: /meeting_acks|does not exist|schema cache/i.test(error.message) ? 'Run migration 63 first.' : error.message };
  revalidatePath('/meetings');
  return { ok: true, msg: 'Got it — see you there. 👍' };
}

// Sender nudges everyone who still hasn't acknowledged — posts a reminder to #sheetz naming them.
export async function nudgePending(meetingId) {
  const g = await me();
  if (!g || !g.sb) return { ok: false, msg: 'Not signed in.' };
  if (!SENDERS.includes(g.role)) return { ok: false, msg: 'Not allowed.' };
  const sb = g.sb;
  const { data: m } = await sb.from('meetings').select('*').eq('id', meetingId).maybeSingle();
  if (!m) return { ok: false, msg: 'Meeting not found.' };
  let roster = [];
  try { const { data } = await sb.from('techs').select('name, crew, position, active, supervisor').limit(500); roster = (data || []).filter((t) => t.name); } catch (_) { try { const { data } = await sb.from('techs').select('name, crew, position, active').limit(500); roster = (data || []).filter((t) => t.name); } catch (__) {} }
  const field = roster.filter((t) => t.active !== false && (!t.position || FIELD_POSITIONS.includes(String(t.position).toLowerCase().replace(/\s+/g, '_'))));
  const required = requiredNames(field, m.audience);
  const { data: acks } = await sb.from('meeting_acks').select('tech_name').eq('meeting_id', meetingId);
  const acked = new Set((acks || []).map((a) => String(a.tech_name).toLowerCase()));
  const pending = required.filter((n) => !acked.has(n.toLowerCase()));
  if (!pending.length) return { ok: true, msg: 'Everyone has acknowledged. 🎉' };
  const when = new Date(m.starts_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const r = await postToDiscord(`⏰ Reminder — ${m.title} (${when}). Still need 👍 from: ${pending.join(', ')}. Acknowledge in the app → Meetings.`);
  revalidatePath('/meetings');
  return { ok: !!r.ok, msg: r.ok ? `Nudged ${pending.length} in #sheetz.` : `Couldn’t post: ${r.error}` };
}

export async function deleteMeeting(meetingId) {
  const g = await me();
  if (!g || !g.sb) return { ok: false, msg: 'Not signed in.' };
  if (!SENDERS.includes(g.role)) return { ok: false, msg: 'Not allowed.' };
  try { await g.sb.from('meetings').delete().eq('id', meetingId); } catch (_) { return { ok: false, msg: 'Failed.' }; }
  revalidatePath('/meetings');
  return { ok: true, msg: 'Meeting removed.' };
}
