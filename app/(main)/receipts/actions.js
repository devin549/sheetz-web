'use server';

import { Buffer } from 'node:buffer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { getAnthropic, isAiConfigured, AI_MODEL } from '@/lib/anthropic';
import { revalidatePath } from 'next/cache';

const CATS = ['materials', 'fuel', 'tools', 'permit', 'other'];
const VISION_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

async function assertAcct() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  if (!user || !(can(profile.role, 'seeFinancials') || can(profile.role, 'seeReports'))) throw new Error('Not allowed.');
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Server not configured.');
  return { sb, user, profile };
}
const clean = (v, n = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// Save / verify / flag the receipt entry for one receipt photo (upsert keyed on photo_id).
export async function saveReceipt(formData) {
  let ctx; try { ctx = await assertAcct(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const photoId = clean(formData.get('photoId'), 80);
  if (!photoId) return { ok: false, msg: 'No receipt.' };
  const status = ['pending', 'verified', 'flagged'].includes(formData.get('status')) ? formData.get('status') : 'pending';
  const amount = Number(formData.get('amount'));
  const row = {
    photo_id: photoId, job_id: clean(formData.get('jobId'), 80) || null,
    vendor: clean(formData.get('vendor'), 120) || null,
    amount_cents: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null,
    category: CATS.includes(formData.get('category')) ? formData.get('category') : null,
    note: clean(formData.get('note'), 400) || null,
    status,
    reviewed_by: status !== 'pending' ? ctx.user.id : null,
    reviewed_by_name: status !== 'pending' ? (ctx.profile.name || ctx.user.email) : null,
    reviewed_at: status !== 'pending' ? new Date().toISOString() : null,
  };
  const { error } = await ctx.sb.from('receipt_entries').upsert(row, { onConflict: 'photo_id' });
  if (error) {
    if (/could not find|does not exist|schema cache/i.test(error.message || '')) return { ok: false, msg: 'Run supabase/29_receipts.sql first.' };
    return { ok: false, msg: error.message };
  }
  revalidatePath('/receipts');
  return { ok: true, msg: status === 'verified' ? 'Verified.' : status === 'flagged' ? 'Flagged.' : 'Saved.' };
}

// Flag a scanned bill as a SUBCONTRACTOR's → routes to accounting's verify queue, held from payment.
// Available to any office reviewer who can see receipts (the field crew flags via the job-side action).
export async function confirmSubcontractor(formData) {
  let ctx; try { ctx = await assertAcct(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const photoId = clean(formData.get('photoId'), 80);
  if (!photoId) return { ok: false, msg: 'No receipt.' };
  const isSub = String(formData.get('isSub')) !== 'false';
  const patch = isSub
    ? { photo_id: photoId, is_subcontractor: true, sub_status: 'pending_verify', sub_name: clean(formData.get('subName'), 120) || null, sub_confirmed_by: ctx.profile.name || ctx.user.email, sub_confirmed_at: new Date().toISOString() }
    : { photo_id: photoId, is_subcontractor: false, sub_status: null, sub_confirmed_by: null, sub_confirmed_at: null }; // undo
  const { error } = await ctx.sb.from('receipt_entries').upsert(patch, { onConflict: 'photo_id' });
  if (error) return { ok: false, msg: /sub_status|column|schema cache|does not exist/i.test(error.message || '') ? 'Run supabase/137_subcontractor_receipts.sql first.' : error.message };
  try { await ctx.sb.from('audit_log').insert({ actor_id: ctx.user.id, actor_name: ctx.profile.name || ctx.user.email, role: ctx.profile.role, action: isSub ? 'receipt.sub_confirmed' : 'receipt.sub_cleared_flag', entity: 'receipt', entity_id: photoId, detail: { sub_name: patch.sub_name || null } }); } catch (_) {}
  revalidatePath('/receipts');
  return { ok: true, msg: isSub ? 'Flagged as subcontractor — accounting must verify before it’s paid.' : 'Sub flag removed.' };
}

// Accounting VERIFIES a flagged subcontractor bill: cleared = OK to pay (in AP/QuickBooks — we move no money)
// or rejected. seeFinancials only (the money decision); the confirm step can be done by any office reviewer.
export async function verifySubcontractor(photoId, decision, reason) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  if (!user || !can(profile.role, 'seeFinancials')) return { ok: false, msg: 'Only accounting / owner can verify a subcontractor payment.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  const pid = clean(photoId, 80);
  if (!['cleared', 'rejected'].includes(decision)) return { ok: false, msg: 'Bad decision.' };
  const patch = { sub_status: decision, sub_verified_by: profile.name || user.email, sub_verified_at: new Date().toISOString(), sub_reject_reason: decision === 'rejected' ? (clean(reason, 300) || 'Not approved') : null };
  const { error } = await sb.from('receipt_entries').update(patch).eq('photo_id', pid).eq('is_subcontractor', true);
  if (error) return { ok: false, msg: /sub_status|column|schema cache|does not exist/i.test(error.message || '') ? 'Run supabase/137_subcontractor_receipts.sql first.' : error.message };
  try { await sb.from('audit_log').insert({ actor_id: user.id, actor_name: profile.name || user.email, role: profile.role, action: decision === 'cleared' ? 'receipt.sub_cleared_to_pay' : 'receipt.sub_rejected', entity: 'receipt', entity_id: pid, detail: { reason: patch.sub_reject_reason || null } }); } catch (_) {}
  revalidatePath('/receipts');
  return { ok: true, msg: decision === 'cleared' ? 'Cleared to pay — pay it in your AP/QuickBooks.' : 'Rejected — held, not to be paid.' };
}

// AI-read a receipt photo → suggested vendor / amount / category (office reviews, then Verify).
export async function readReceipt(photoId) {
  let ctx; try { ctx = await assertAcct(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  if (!isAiConfigured(ctx.profile.role)) return { ok: false, msg: 'No Claude key for your role — add ANTHROPIC_KEY_* in Vercel.' };
  const pid = clean(photoId, 80);
  if (!pid) return { ok: false, msg: 'No receipt.' };

  const { data: photo } = await ctx.sb.from('job_photos').select('storage_bucket, storage_path, mime_type').eq('id', pid).maybeSingle();
  if (!photo) return { ok: false, msg: 'Receipt not found.' };
  const mime = String(photo.mime_type || 'image/jpeg');
  if (!VISION_MIME.has(mime)) return { ok: false, msg: 'Can’t auto-read this image type (HEIC?) — enter it manually.' };

  const { data: blob, error: dErr } = await ctx.sb.storage.from(photo.storage_bucket || 'job-photos').download(photo.storage_path);
  if (dErr || !blob) return { ok: false, msg: 'Couldn’t open the image.' };
  const b64 = Buffer.from(await blob.arrayBuffer()).toString('base64');

  const anthropic = getAnthropic(ctx.profile.role);
  let res;
  try {
    res = await anthropic.messages.create({
      model: AI_MODEL, max_tokens: 300, output_config: { effort: 'low' },
      system: 'You read purchase receipts. Most are plumbing-supply receipts, but some are a SUBCONTRACTOR\'s labor/service invoice (an outside company we hire — excavation, concrete, drywall, electrician, restoration) rather than a parts store. Reply with ONLY compact JSON: {"vendor": string|null, "amount": number|null, "category": "materials"|"fuel"|"tools"|"permit"|"other"|null, "is_subcontractor": boolean, "sub_name": string|null}. amount = the grand total in dollars as a number (no $, no commas). Set is_subcontractor true ONLY if it clearly looks like an outside labor/service bill (a contractor invoice, not a parts-store receipt); if unsure, false.',
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mime, data: b64 } }, { type: 'text', text: 'Extract vendor, total amount, and category from this receipt.' }] }],
    });
  } catch (e) { return { ok: false, msg: 'AI error: ' + (e && e.message ? e.message : String(e)) }; }

  const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').replace(/```json|```/g, '').trim();
  let parsed; try { parsed = JSON.parse(text); } catch { return { ok: false, msg: 'Couldn’t read that receipt clearly — enter it manually.' }; }
  const amount = Number(parsed.amount);
  try { await ctx.sb.from('ai_usage').insert({ role: ctx.profile.role, screen: 'receipts', model: AI_MODEL, input_tokens: res.usage?.input_tokens || 0, output_tokens: res.usage?.output_tokens || 0, user_email: ctx.user.email || '' }); } catch (_) {}
  return { ok: true, vendor: parsed.vendor || '', amount: Number.isFinite(amount) && amount > 0 ? amount : '', category: CATS.includes(parsed.category) ? parsed.category : '', isSubcontractor: parsed.is_subcontractor === true, subName: String(parsed.sub_name || '').slice(0, 120) };
}
