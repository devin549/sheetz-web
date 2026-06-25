import crypto from 'crypto';

// Command Center PIN crypto. SERVER-ONLY (imports node:crypto). The PIN is a convenience second factor
// over an already-authenticated session, so a salted SHA-256 hash (salt = userId) is adequate — the raw
// PIN is never stored. Unlock state is a short-lived HMAC-signed cookie (no DB round-trip per request).
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || 'cb-cc-pin-fallback';
export const CC_TTL_MS = 30 * 60 * 1000;       // Command Center re-locks fast (sensitive)
export const IPAD_TTL_MS = 8 * 60 * 60 * 1000;  // iPad PIN lasts the workday (matches HTML "8 hr session")

export const CC_COOKIE = 'cc_unlock';
export const IPAD_COOKIE = 'ipad_unlock';
export function normalizePin(pin) { return String(pin || '').replace(/\D/g, ''); }
export function validPin(pin) { const p = normalizePin(pin); return p.length >= 4 && p.length <= 8; }

export function hashPin(pin, userId) {
  return crypto.createHash('sha256').update(`${userId}:${normalizePin(pin)}`).digest('hex');
}

// Cookie value = `${exp}.${mac}` — verifiable without the DB, expires on its own.
export function signUnlock(userId, ttlMs = CC_TTL_MS) {
  const exp = Date.now() + ttlMs;
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
