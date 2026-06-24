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
      system: 'You read plumbing-supply receipts. Reply with ONLY compact JSON: {"vendor": string|null, "amount": number|null, "category": "materials"|"fuel"|"tools"|"permit"|"other"|null}. amount = the grand total in dollars as a number (no $, no commas).',
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mime, data: b64 } }, { type: 'text', text: 'Extract vendor, total amount, and category from this receipt.' }] }],
    });
  } catch (e) { return { ok: false, msg: 'AI error: ' + (e && e.message ? e.message : String(e)) }; }

  const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').replace(/```json|```/g, '').trim();
  let parsed; try { parsed = JSON.parse(text); } catch { return { ok: false, msg: 'Couldn’t read that receipt clearly — enter it manually.' }; }
  const amount = Number(parsed.amount);
  try { await ctx.sb.from('ai_usage').insert({ role: ctx.profile.role, screen: 'receipts', model: AI_MODEL, input_tokens: res.usage?.input_tokens || 0, output_tokens: res.usage?.output_tokens || 0, user_email: ctx.user.email || '' }); } catch (_) {}
  return { ok: true, vendor: parsed.vendor || '', amount: Number.isFinite(amount) && amount > 0 ? amount : '', category: CATS.includes(parsed.category) ? parsed.category : '' };
}
