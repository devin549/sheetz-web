// Distance + map helpers for "closest tech" routing.

// Great-circle distance in miles between two lat/lng points. Returns null on bad input.
export function haversineMiles(aLat, aLng, bLat, bLng) {
  const ok = [aLat, aLng, bLat, bLng].every((v) => typeof v === 'number' && !Number.isNaN(v));
  if (!ok) return null;
  const R = 3958.8, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)) * 10) / 10;
}

// Maps directions link straight to GPS coordinates (precise — opens turn-by-turn).
export const mapsToCoords = (lat, lng) =>
  (typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng))
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` : '';

export const minutesAgo = (iso) => { try { return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); } catch { return null; } };

// Rough drive ETA in minutes from straight-line miles (~25 mph effective urban + a small buffer). The
// real turn-by-turn ETA comes from the Maps app when the tech taps Route; this is just for ranking.
export const etaMinutes = (miles) => (typeof miles === 'number' && !Number.isNaN(miles) ? Math.max(2, Math.round(miles * 2.4 + 3)) : null);

// Google Maps directions URL. Prefers precise dest coords; falls back to an encoded address. Includes the
// origin when known (true origin→dest route). Mobile/iPad open this straight into turn-by-turn.
export function mapsDir({ destLat, destLng, destAddress, originLat, originLng } = {}) {
  const dest = (typeof destLat === 'number' && typeof destLng === 'number' && !Number.isNaN(destLat) && !Number.isNaN(destLng))
    ? `${destLat},${destLng}` : (destAddress ? encodeURIComponent(destAddress) : '');
  if (!dest) return '';
  const origin = (typeof originLat === 'number' && typeof originLng === 'number' && !Number.isNaN(originLat) && !Number.isNaN(originLng))
    ? `&origin=${originLat},${originLng}` : '';
  return `https://www.google.com/maps/dir/?api=1${origin}&destination=${dest}`;
}
