// Email provider wrapper (Resend REST — no SDK dependency). The whole mass-email feature works
// in DRAFT + APPROVE mode without a key; only the actual SEND needs EMAIL_API_KEY in Vercel.
// Set EMAIL_FROM to a verified Resend sender (e.g. "Clog Busterz Plumbing <billing@clogbusterzplumbing.com>").

export const isEmailConfigured = Boolean(process.env.EMAIL_API_KEY);
export const FROM_EMAIL = process.env.EMAIL_FROM || 'Clog Busterz Plumbing <onboarding@resend.dev>';

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// Wrap a plain-text campaign body in a simple branded HTML shell. {{name}} is personalized per
// recipient before this is called.
export function renderEmailHtml({ subject, body }) {
  const paras = String(body || '').split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;line-height:1.55">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  return `<!doctype html><html><body style="margin:0;background:#f4f3ef;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#fff;border:1px solid #e3e0d8;border-radius:10px;overflow:hidden">
      <div style="background:#FF6B00;color:#fff;padding:14px 20px;font-weight:800;font-size:16px">Clog Busterz Plumbing</div>
      <div style="padding:22px 20px;font-size:14px">${paras}</div>
      <div style="padding:14px 20px;border-top:1px solid #eee;font-size:11px;color:#888">
        You’re receiving this because you’re a Clog Busterz Plumbing customer.
      </div>
    </div>
  </div></body></html>`;
}

// Send one email. Returns { ok, error }. Never throws.
export async function sendOne({ to, subject, html }) {
  if (!isEmailConfigured) return { ok: false, error: 'EMAIL_API_KEY not set' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.EMAIL_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
    });
    if (!res.ok) { const t = await res.text().catch(() => ''); return { ok: false, error: `${res.status} ${t.slice(0, 160)}` }; }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e).slice(0, 160) };
  }
}
