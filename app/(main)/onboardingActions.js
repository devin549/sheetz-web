'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { POLICY_VERSIONS } from '@/lib/onboarding';
import { sendOne, isEmailConfigured } from '@/lib/email';

const LEVELS = ['PG', 'PG-13', 'R'];

// Email the signing employee a copy of the Handbook / NDA so they can actually READ what they're agreeing
// to (and keep a copy). Sends a link to the hosted doc (HANDBOOK_URL / NDA_URL in Vercel). Compliance: a
// signature on a doc you couldn't read is weak — this closes that.
export async function emailMeDoc(which) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Not signed in.' };
  const to = user.email;
  if (!to) return { ok: false, msg: 'No email on your account.' };
  if (!isEmailConfigured) return { ok: false, msg: 'Email isn’t set up yet — ask the office for a copy.' };
  const doc = which === 'nda'
    ? { name: 'Non-Disclosure Agreement', url: process.env.NDA_URL }
    : { name: 'Employee Handbook', url: process.env.HANDBOOK_URL };
  const body = doc.url
    ? `<p>Here’s the CB <strong>${doc.name}</strong> you’re signing in the app — please read the full document, then sign.</p><p><a href="${doc.url}" style="display:inline-block;background:#caa14a;color:#1a1206;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">📖 Open the ${doc.name}</a></p>`
    : `<p>You asked for a copy of the CB <strong>${doc.name}</strong>. The office will email you the current signed copy shortly.</p>`;
  const r = await sendOne({ to, subject: `Your copy — CB ${doc.name}`, html: `${body}<p style="color:#888;font-size:12px;margin-top:18px">Clog Busterz Plumbing · keep this for your records.</p>` });
  if (!r || !r.ok) return { ok: false, msg: 'Could not send — try again, or ask the office.' };
  return { ok: true, msg: `Sent to ${to}.` };
}
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

  // Audit rows — one per policy, server timestamp is the legal record. detail + initials are NOT NULL in
  // prod, so every row sets both (empty where N/A) — never leave them undefined.
  const rows = [
    { user_id: user.id, kind: 'monitoring', version: POLICY_VERSIONS.monitoring, initials: '', detail: { name: profile.name } },
    { user_id: user.id, kind: 'handbook', version: POLICY_VERSIONS.handbook, initials: hb, detail: {} },
    { user_id: user.id, kind: 'nda', version: POLICY_VERSIONS.nda, initials: nda, detail: {} },
  ];
  if (level === 'R') rows.push({ user_id: user.id, kind: 'roast_r', version: POLICY_VERSIONS.roast_r, initials: '', detail: { agreed: true } });

  const ins = await sb.from('policy_acks').insert(rows);
  // Only blame the migration on a genuine missing-table/column error — otherwise surface the real reason.
  if (ins.error) return { ok: false, msg: /relation .* does not exist|could not find the .* column|schema cache/i.test(ins.error.message || '') ? 'Run supabase/75_policy_acks.sql first.' : ins.error.message };

  const upd = await sb.from('profiles').update({ roast_level: level, roast_locked: true, onboarded_at: new Date().toISOString() }).eq('user_id', user.id);
  if (upd.error) return { ok: false, msg: /column|schema cache|does not exist/i.test(upd.error.message || '') ? 'Run supabase/74 + 75 first.' : upd.error.message };

  revalidatePath('/', 'layout');
  return { ok: true, msg: 'You’re all set.' };
}
