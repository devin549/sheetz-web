'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { sendOne } from '@/lib/email';
import { verifyDocNote } from '@/lib/aiVision';

// CB has NO sick PTO type — vacation/personal/unpaid only (sick days are handled as excused absences).
const KINDS = ['vacation', 'personal', 'unpaid'];
const RECORDS_EMAIL = process.env.RECORDS_EMAIL || 'records@clogbusterzplumbing.com';
const clean = (v, n = 300) => String(v || '').trim().slice(0, n);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const canApprove = (r) => can(r, 'manageUsers') || can(r, 'assignJobs') || can(r, 'seeCrew');

// A tech submits a time-off request → pending for a manager.
export async function requestTimeOff(form) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  const kind = KINDS.includes(form.get('kind')) ? form.get('kind') : 'vacation';
  const start = clean(form.get('start_date'), 10);
  let end = clean(form.get('end_date'), 10);
  if (!isDate(start)) return { ok: false, msg: 'Pick a start date.' };
  if (end && !isDate(end)) end = null;
  const sb = getSupabaseAdmin();
  const { error } = await sb.from('time_off_requests').insert({ user_id: user.id, tech_name: profile.name || user.email, kind, start_date: start, end_date: end || null, reason: clean(form.get('reason'), 300) || null });
  if (error) return { ok: false, msg: /relation|column|schema cache|does not exist/i.test(error.message || '') ? 'Run supabase/82_time_off.sql first.' : error.message };
  try { await sb.from('audit_log').insert({ actor_id: user.id, actor_name: profile.name || user.email, role: profile.role, action: 'timeoff.requested', entity: 'tech', entity_id: user.id, detail: { kind, start, end } }); } catch (_) {}
  revalidatePath('/pto');
  return { ok: true, msg: 'Sent to your supervisor.' };
}

// ── Excused / unexcused absences — POLICY decides (not a manager's gut), override is logged ──────────
// Policy: bereavement or jury duty (their own categories) = auto-EXCUSED (no note needed); else a verified
// doctor's note OR a pre-approved PTO covering the date = EXCUSED; otherwise UNEXCUSED. An image AI can't
// confirm → 'pending' (human looks), never auto-excused.
const ABSENCE_CATEGORIES = ['bereavement', 'jury_duty', 'sick', 'doctor', 'other'];
const AUTO_EXCUSED_CATEGORIES = new Set(['bereavement', 'jury_duty']);
async function pendingPolicy(sb, userId, dateStr, hasVerifiedDoc, category) {
  if (AUTO_EXCUSED_CATEGORIES.has(category)) return 'excused'; // funeral / jury duty — excused without a note
  if (hasVerifiedDoc) return 'excused';
  try {
    const { data } = await sb.from('time_off_requests').select('id').eq('user_id', userId).eq('status', 'approved').lte('start_date', dateStr).or(`end_date.gte.${dateStr},and(end_date.is.null,start_date.eq.${dateStr})`).limit(1);
    if (data && data.length) return 'excused';
  } catch (_) {}
  return 'unexcused';
}

export async function reportAbsence(payload) {
  const p = payload || {};
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  const date = clean(p.date, 10);
  if (!isDate(date)) return { ok: false, msg: 'Pick the absence date.' };
  const category = ABSENCE_CATEGORIES.includes(p.category) ? p.category : 'other';
  const bereavementRelation = category === 'bereavement' && ['immediate', 'extended'].includes(p.relation) ? p.relation : null;
  const sb = getSupabaseAdmin();

  // If a doctor's note image was attached, AI-verify it's a real note (no medical content read), store it
  // privately, and email it to records@ with ONLY the name in the subject.
  let docPath = null, docOk = false, docEmailed = null, verify = null;
  if (typeof p.docPhoto === 'string' && /^data:image\//.test(p.docPhoto)) {
    verify = await verifyDocNote(p.docPhoto, profile.role);
    docOk = !!(verify && verify.isMedicalNote && verify.confidence !== 'low');
    try {
      const b64 = p.docPhoto.split(',')[1];
      const path = `${user.id}/${date}-${Date.now()}.jpg`;
      const up = await sb.storage.from('excuse-docs').upload(path, Buffer.from(b64, 'base64'), { contentType: 'image/jpeg', upsert: true });
      if (!up.error) docPath = path;
      const r = await sendOne({ to: RECORDS_EMAIL, subject: `Excuse documentation — ${profile.name || user.email}`, html: `<p><strong>${profile.name || user.email}</strong> submitted a doctor's note for an absence on <strong>${date}</strong>.</p><p>Attached for verification. This is absence documentation only — not a medical record; CB does not read or store the medical reason.</p>`, attachments: [{ filename: 'excuse.jpg', content: b64 }] });
      if (r.ok) docEmailed = new Date().toISOString();
    } catch (_) {}
  }

  const status = await pendingPolicy(sb, user.id, date, docOk, category);
  // A note was submitted but AI couldn't confirm it's a real note → hold for a human, don't auto-decide.
  // (Auto-excused categories like bereavement skip this — they don't depend on a note.)
  const finalStatus = (p.docPhoto && !docOk && !AUTO_EXCUSED_CATEGORIES.has(category)) ? 'pending' : status;
  const row = { user_id: user.id, tech_name: profile.name || user.email, absence_date: date, status: finalStatus, reason: clean(p.reason, 200) || null, doc_path: docPath, doc_emailed_at: docEmailed, category, bereavement_relation: bereavementRelation };
  let { error } = await sb.from('absences').insert(row);
  // Pre-152 (no category columns) → retry without them so reporting still works.
  if (error && /category|bereavement_relation/i.test(error.message || '')) { const { category: _c, bereavement_relation: _r, ...lite } = row; ({ error } = await sb.from('absences').insert(lite)); }
  if (error) return { ok: false, msg: /relation|column|schema cache|does not exist/i.test(error.message || '') ? 'Run supabase/83_absences.sql first.' : error.message };
  try { await sb.from('audit_log').insert({ actor_id: user.id, actor_name: profile.name || user.email, role: profile.role, action: 'absence.reported', entity: 'tech', entity_id: user.id, detail: { date, status: finalStatus, doc: !!docPath, verify: verify ? { isNote: verify.isMedicalNote, confidence: verify.confidence } : null } }); } catch (_) {}
  revalidatePath('/pto');
  const msg = finalStatus === 'excused'
    ? (category === 'bereavement' ? '✓ Excused — bereavement. Our condolences.'
      : category === 'jury_duty' ? '✓ Excused — jury duty.'
      : '✓ Excused — documentation on file (sent to records).')
    : finalStatus === 'pending' ? '⏳ Submitted — that image couldn’t be confirmed as a note; records will review.'
      : 'Logged as unexcused (no documentation). Pick the right reason or submit a doctor’s note to excuse it.';
  return { ok: true, status: finalStatus, msg };
}

// Manager OVERRIDE — flips an absence against the policy result. Requires a reason and is flagged in the
// audit trail as an override, so favoritism is visible. Does NOT silently become the norm.
export async function overrideAbsence(id, status, reason) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!(can(profile.role, 'manageUsers') || can(profile.role, 'assignJobs'))) return { ok: false, msg: 'Managers only.' };
  if (!['excused', 'unexcused'].includes(status)) return { ok: false, msg: 'Bad status.' };
  if (clean(reason, 200).length < 4) return { ok: false, msg: 'A reason is required for an override.' };
  const sb = getSupabaseAdmin();
  const { data: before } = await sb.from('absences').select('status').eq('id', id).maybeSingle();
  const { error } = await sb.from('absences').update({ status, decided_by: user.id, decided_by_name: profile.name || user.email, decided_at: new Date().toISOString(), decision_note: clean(reason, 200) }).eq('id', id);
  if (error) return { ok: false, msg: error.message };
  const againstPolicy = before && before.status !== 'pending' && before.status !== status;
  try { await sb.from('audit_log').insert({ actor_id: user.id, actor_name: profile.name || user.email, role: profile.role, action: againstPolicy ? 'absence.override_against_policy' : 'absence.decided', entity: 'absence', entity_id: String(id), detail: { from: before?.status, to: status, reason: clean(reason, 200) } }); } catch (_) {}
  revalidatePath('/pto');
  return { ok: true };
}

// Manager approves/denies a request.
export async function decideTimeOff(id, approve, note) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!canApprove(profile.role)) return { ok: false, msg: 'Supervisors approve time off.' };
  const sb = getSupabaseAdmin();
  const { error } = await sb.from('time_off_requests').update({ status: approve ? 'approved' : 'denied', decided_by: user.id, decided_by_name: profile.name || user.email, decided_at: new Date().toISOString(), decision_note: clean(note, 200) || null }).eq('id', id);
  if (error) return { ok: false, msg: error.message };
  try { await sb.from('audit_log').insert({ actor_id: user.id, actor_name: profile.name || user.email, role: profile.role, action: approve ? 'timeoff.approved' : 'timeoff.denied', entity: 'timeoff', entity_id: String(id) }); } catch (_) {}
  revalidatePath('/pto');
  return { ok: true };
}
