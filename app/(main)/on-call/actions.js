'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { postToDiscord } from '@/lib/discord';
import { etWeekday, announceText, weeklyText } from '@/lib/onCall';
import { revalidatePath } from 'next/cache';

const EDITORS = ['owner', 'admin', 'gm', 'om'];

async function gate() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await loadProfile(user) : null;
  if (!user || !profile || profile.active === false) return null;
  return { role: String(profile.role || '').toLowerCase(), name: profile.name || user.email, sb: getSupabaseAdmin() };
}
const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, 120);

// OM/GM sets the week's on-call rotation (one "current" row, overwritten each week).
export async function saveOnCall(formData) {
  const g = await gate();
  if (!g || !g.sb) return { ok: false, msg: 'Not signed in.' };
  if (!EDITORS.includes(g.role)) return { ok: false, msg: 'Only GM / office manager / owner can set on-call.' };
  const row = {
    slot: 'current',
    mon: clean(formData.get('mon')) || null, tue: clean(formData.get('tue')) || null,
    wed: clean(formData.get('wed')) || null, thu: clean(formData.get('thu')) || null,
    weekend: clean(formData.get('weekend')) || null,
    helper_week: clean(formData.get('helper_week')) || null, supervisor: clean(formData.get('supervisor')) || null,
    week_label: clean(formData.get('week_label')) || null, set_by: g.name, updated_at: new Date().toISOString(),
  };
  const { error } = await g.sb.from('on_call_schedule').upsert(row, { onConflict: 'slot' });
  if (error) return { ok: false, msg: /on_call_schedule|does not exist|schema cache/i.test(error.message) ? 'Run migration 65 first.' : error.message };
  // Ship the full-week breakdown to #sheetz when the office sets the week (the manual post, automated). Then
  // each night the cron posts that night's tech + helper + supervisor. Best-effort — never fail the save.
  let posted = false;
  try { const wk = weeklyText(row); if (wk) { const r = await postToDiscord(wk); posted = !!(r && r.ok); } } catch (_) {}
  revalidatePath('/on-call');
  return { ok: true, msg: posted ? 'Saved — week posted to #sheetz.' : 'On-call schedule saved.' };
}

// Post tonight's on-call to #sheetz right now (also runs automatically at 4:30pm ET).
export async function postOnCallNow() {
  const g = await gate();
  if (!g || !g.sb) return { ok: false, msg: 'Not signed in.' };
  if (!EDITORS.includes(g.role)) return { ok: false, msg: 'Not allowed.' };
  const { data: sched } = await g.sb.from('on_call_schedule').select('*').eq('slot', 'current').maybeSingle();
  const wd = etWeekday();
  const msg = announceText(sched, wd === 'Saturday' || wd === 'Sunday' ? 'Friday' : wd); // weekend → show the weekend person
  if (!msg) return { ok: false, msg: 'No on-call set for today — fill the schedule first.' };
  const r = await postToDiscord(msg);
  return { ok: !!r.ok, msg: r.ok ? 'Posted to #sheetz.' : 'Discord: ' + r.error };
}
