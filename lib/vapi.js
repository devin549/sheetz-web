// Vapi AI-calling wrapper (REST — no SDK). Ported from Owner_Sheet/CB_Owner_PP_Vapi_v1.js.
// Whole feature works in queue/approve mode without keys; only the actual dial needs the 3 vars:
//   VAPI_API_KEY · VAPI_PHONE_NUMBER_ID · VAPI_ASSISTANT_ID   (+ VAPI_WEBHOOK_SECRET for callbacks)
// PETE_TEST_NUMBERS = comma-separated internal phones safe to ring while testing (the safety rail).

export const isVapiConfigured = Boolean(process.env.VAPI_API_KEY && process.env.VAPI_PHONE_NUMBER_ID && process.env.VAPI_ASSISTANT_ID);
export const VAPI_BASE = 'https://api.vapi.ai';

// 10-digit US → +1XXXXXXXXXX. Returns null if it can't make a valid E.164.
export function normalizeE164(raw) {
  const s = String(raw || '').trim();
  const d = s.replace(/[^\d]/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  if (s.startsWith('+') && d.length >= 11) return '+' + d;
  return null;
}

export function testNumbers() {
  return String(process.env.PETE_TEST_NUMBERS || '').split(',').map((s) => normalizeE164(s)).filter(Boolean);
}
export function isTestNumber(e164) { return testNumbers().includes(e164); }

// Fire one Vapi call. Returns { ok, callId, error } — never throws.
export async function placeCall({ toE164, name, variableValues }) {
  if (!isVapiConfigured) return { ok: false, error: 'VAPI not configured (need VAPI_API_KEY / VAPI_PHONE_NUMBER_ID / VAPI_ASSISTANT_ID)' };
  if (!toE164) return { ok: false, error: 'No phone number' };
  try {
    const res = await fetch(`${VAPI_BASE}/call`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assistantId: process.env.VAPI_ASSISTANT_ID,
        phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
        customer: { number: toE164, name: name || 'Customer' },
        assistantOverrides: { variableValues: variableValues || {} },
        metadata: { source: 'sheetz-web-pete' },
      }),
    });
    const body = await res.text();
    let parsed = {}; try { parsed = JSON.parse(body) || {}; } catch (_) {}
    if (!res.ok) return { ok: false, error: `Vapi HTTP ${res.status}: ${body.slice(0, 160)}` };
    return { ok: true, callId: parsed.id || parsed.callId || '' };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e).slice(0, 160) };
  }
}
