'use server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { reviewPhoto } from '@/lib/aiVision';

// Human labels for the manager fail codes — these become the AI's "learned lessons" text.
const FAIL_LABEL = {
  blurry: 'blurry / unreadable shot',
  wrong_area: 'photo of the wrong area — not the work performed',
  no_after_proof: 'no clear AFTER proof of the finished work',
  unfinished: 'work visibly unfinished in the shot',
  missing_equipment: 'required equipment not shown',
  customer_issue: 'visible customer-property issue in frame',
  other: 'unusable as closeout proof',
};

// 🧠 THE LEARNING LOOP — turn the last 90 days of MANAGER pass/fail reviews into lessons the AI pre-check
// reads on every shot. Company-wide patterns tighten the check for everyone; a tech's OWN prior fails become
// their personal "repeat offense" list (repeat → the camera hard-blocks the upload). Best-effort: any query
// hiccup → no lessons, the pre-check still runs the base rules.
async function loadQaLessons(userId) {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return null;
    const since = new Date(Date.now() - 90 * 86400000).toISOString();
    const { data: fails } = await sb.from('job_photo_reviews')
      .select('photo_id, fail_reason')
      .eq('result', 'fail').gte('created_at', since)
      .order('created_at', { ascending: false }).limit(250);
    if (!fails?.length) return null;
    const ids = [...new Set(fails.map((f) => f.photo_id).filter(Boolean))];
    let byPhoto = {};
    if (ids.length) {
      const { data: ph } = await sb.from('job_photos').select('id, kind, uploaded_by').in('id', ids.slice(0, 250));
      byPhoto = Object.fromEntries((ph || []).map((p) => [p.id, p]));
    }
    const bump = (map, key) => { map[key] = (map[key] || 0) + 1; };
    const company = {}, mine = {};
    for (const f of fails) {
      const p = byPhoto[f.photo_id] || {};
      const label = `${FAIL_LABEL[f.fail_reason] || f.fail_reason || 'failed'}${p.kind ? ` on "${p.kind}" shots` : ''}`;
      bump(company, label);
      if (p.uploaded_by && String(p.uploaded_by) === String(userId)) bump(mine, label);
    }
    const top = (map, n) => Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} (×${v})`);
    const out = { company: top(company, 5), mine: top(mine, 3) };
    return (out.company.length || out.mine.length) ? out : null;
  } catch (_) { return null; }
}

// Pre-check a shot with Claude Vision BEFORE it's uploaded — catches blurry/dark/wrong-subject photos so
// the tech re-shoots on the spot instead of the supervisor bouncing it later. Now lesson-aware: manager
// fails teach it what to catch, and a tech repeating their OWN prior fail gets repeatOffense=true (the
// camera blocks "use it anyway" on those). Fails soft → base rules / null.
export async function prescanPhoto(dataUrl, jobType, requiredKinds) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  const lessons = await loadQaLessons(user.id);
  const r = await reviewPhoto({ dataUrl, jobType: jobType || '', requiredKinds: Array.isArray(requiredKinds) ? requiredKinds : [], role: profile.role, lessons });
  if (!r) return { ok: false, msg: 'Pre-check unavailable right now — upload anyway, the office still reviews it.' };
  return { ok: true, review: r };
}
