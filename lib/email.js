// Email provider wrapper (Resend REST — no SDK dependency). The whole mass-email feature works
// in DRAFT + APPROVE mode without a key; only the actual SEND needs EMAIL_API_KEY in Vercel.
// Set EMAIL_FROM to a verified Resend sender (e.g. "Clog Busterz Plumbing <billing@clogbusterzplumbing.com>").

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const isEmailConfigured = Boolean(process.env.EMAIL_API_KEY);
export const FROM_EMAIL = process.env.EMAIL_FROM || 'Clog Busterz Plumbing <onboarding@resend.dev>';

// Resend plan caps (override with env when you upgrade). Free = 100/day, 3,000/month.
export const EMAIL_LIMITS = {
  day: Number(process.env.EMAIL_DAILY_LIMIT) || 100,
  month: Number(process.env.EMAIL_MONTHLY_LIMIT) || 3000,
};

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// Public base URL for the open-tracking pixel (recipient's mail client fetches it). Set APP_URL in
// Vercel; on production Vercel auto-provides VERCEL_PROJECT_PRODUCTION_URL. Empty → no pixel.
export function appBaseUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return '';
}

// Wrap a plain-text campaign body in a simple branded HTML shell. {{name}} is personalized per
// recipient before this is called. `trackId` (the email_sends row id) embeds a 1x1 open-tracking
// pixel — like ServiceTitan / FieldEdge. Opens are directional (image-blocking clients skew it).
export function renderEmailHtml({ subject, body, trackId }) {
  const paras = String(body || '').split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;line-height:1.55">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  const base = appBaseUrl();
  const pixel = (trackId && base) ? `<img src="${base}/api/track/open?s=${encodeURIComponent(trackId)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0" />` : '';
  return `<!doctype html><html><body style="margin:0;background:#f4f3ef;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#fff;border:1px solid #e3e0d8;border-radius:10px;overflow:hidden">
      <div style="background:#FF6B00;color:#fff;padding:14px 20px;font-weight:800;font-size:16px">Clog Busterz Plumbing</div>
      <div style="padding:22px 20px;font-size:14px">${paras}</div>
      <div style="padding:14px 20px;border-top:1px solid #eee;font-size:11px;color:#888">
        You’re receiving this because you’re a Clog Busterz Plumbing customer.
      </div>
    </div>
  </div>${pixel}</body></html>`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Send one email. Returns { ok, error }. Never throws. Retries on 429 (rate limit) / 5xx with
// backoff so a big blast survives Resend's per-second cap.
// A clean cc list: an array or single string, minus blanks + anything already in `to` (no dupes). null = omit.
function ccList(cc, to) {
  const arr = (Array.isArray(cc) ? cc : [cc]).map((e) => String(e || '').trim()).filter(Boolean);
  const seen = new Set([String(to || '').trim().toLowerCase()]);
  const out = arr.filter((e) => { const k = e.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  return out.length ? out : null;
}

export async function sendOne({ to, subject, html, attachments, cc }, attempt = 0) {
  if (!isEmailConfigured) return { ok: false, error: 'EMAIL_API_KEY not set' };
  const ccArr = cc ? ccList(cc, to) : null;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.EMAIL_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html, ...(ccArr ? { cc: ccArr } : {}), ...(attachments ? { attachments } : {}) }),
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 3) { await sleep(1000 * (attempt + 1)); return sendOne({ to, subject, html, attachments, cc }, attempt + 1); }
    if (!res.ok) { const t = await res.text().catch(() => ''); return { ok: false, error: `${res.status} ${t.slice(0, 160)}` }; }
    try { const sb = getSupabaseAdmin(); if (sb) await sb.from('email_events').insert({ to_email: to }); } catch (_) {} // count it (best-effort)
    return { ok: true };
  } catch (e) {
    if (attempt < 2) { await sleep(800 * (attempt + 1)); return sendOne({ to, subject, html, cc }, attempt + 1); }
    return { ok: false, error: String((e && e.message) || e).slice(0, 160) };
  }
}
