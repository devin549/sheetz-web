'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { POLICY_VERSIONS } from '@/lib/onboarding';

const LEVELS = ['PG', 'PG-13', 'R'];
const initials = (v) => String(v || '').trim().toUpperCase().slice(0, 4);

// Complete the tech onboarding gate in one shot: records the Monitoring, Handbook, and NDA acceptances
// (each server-timestamped), locks in the chosen roast level, and — if R — records the separate R
// re-consent. Sets profiles.onboarded_at so the gate clears. Everything is written with the service-role
// client; the browser only sends the signed initials + choices.
export async function completeOnboarding(payload) {
  const p = payload || {};
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };

  if (!p.monitoring) return { ok: false, msg: 'Acknowledge the monitoring disclosure to continue.' };
  const hb = initials(p.handbookInitials), nda = initials(p.ndaInitials);
  if (hb.length < 2) return { ok: false, msg: 'Sign the Handbook with your initials.' };
  if (nda.length < 2) return { ok: false, msg: 'Sign the NDA with your initials.' };
  const level = LEVELS.includes(p.roastLevel) ? p.roastLevel : null;
  if (!level) return { ok: false, msg: 'Pick a roast level (PG, PG-13, or R).' };
  if (level === 'R' && !p.roastRAccepted) return { ok: false, msg: 'R requires the thick-skin acceptance.' };

  // Audit rows — one per policy, server timestamp is the legal record.
  const rows = [
    { user_id: user.id, kind: 'monitoring', version: POLICY_VERSIONS.monitoring, detail: { name: profile.name } },
    { user_id: user.id, kind: 'handbook', version: POLICY_VERSIONS.handbook, initials: hb },
    { user_id: user.id, kind: 'nda', version: POLICY_VERSIONS.nda, initials: nda },
  ];
  if (level === 'R') rows.push({ user_id: user.id, kind: 'roast_r', version: POLICY_VERSIONS.roast_r, detail: { agreed: true } });

  const ins = await sb.from('policy_acks').insert(rows);
  if (ins.error) return { ok: false, msg: /policy_acks|relation|column|schema cache|does not exist/i.test(ins.error.message || '') ? 'Run supabase/75_policy_acks.sql first.' : ins.error.message };

  const upd = await sb.from('profiles').update({ roast_level: level, roast_locked: true, onboarded_at: new Date().toISOString() }).eq('user_id', user.id);
  if (upd.error) return { ok: false, msg: /column|schema cache|does not exist/i.test(upd.error.message || '') ? 'Run supabase/74 + 75 first.' : upd.error.message };

  revalidatePath('/', 'layout');
  return { ok: true, msg: 'You’re all set.' };
}
