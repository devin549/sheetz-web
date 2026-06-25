import crypto from 'crypto';

// Command Center PIN crypto. SERVER-ONLY (imports node:crypto). The PIN is a convenience second factor
// over an already-authenticated session, so a salted SHA-256 hash (salt = userId) is adequate — the raw
// PIN is never stored. Unlock state is a short-lived HMAC-signed cookie (no DB round-trip per request).
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || 'cb-cc-pin-fallback';
const TTL_MS = 30 * 60 * 1000; // 30-minute unlock window

export const CC_COOKIE = 'cc_unlock';
export function normalizePin(pin) { return String(pin || '').replace(/\D/g, ''); }
export function validPin(pin) { const p = normalizePin(pin); return p.length >= 4 && p.length <= 8; }

export function hashPin(pin, userId) {
  return crypto.createHash('sha256').update(`${userId}:${normalizePin(pin)}`).digest('hex');
}

// Cookie value = `${exp}.${mac}` — verifiable without the DB, expires on its own.
export function signUnlock(userId) {
  const exp = Date.now() + TTL_MS;
  const mac = crypto.createHmac('sha256', SECRET).update(`${userId}.${exp}`).digest('hex').slice(0, 32);
  return `${exp}.${mac}`;
}
export function verifyUnlock(userId, cookieValue) {
  if (!cookieValue) return false;
  const [expStr, mac] = String(cookieValue).split('.');
  const exp = Number(expStr);
  if (!exp || exp < Date.now()) return false;
  const expect = crypto.createHmac('sha256', SECRET).update(`${userId}.${exp}`).digest('hex').slice(0, 32);
  return mac.length === expect.length && crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect));
}

// Roles whose home IS the sensitive Command Center → they get the PIN gate. Techs/helpers/shop see their
// own (non-sensitive) home and aren't gated.
export function ccGated(role) {
  return ['owner', 'admin', 'gm', 'fs', 'foreman'].includes(String(role || '').toLowerCase());
}
