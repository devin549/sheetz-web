// Service-area gate for web bookings. Devin's rule: don't let people self-schedule a confirmed slot
// in a city we haven't worked, and anything over MAX_MILES from base "can't guarantee service" → it
// comes in as a flagged review hold for the office to call back. Pure logic; the geocode is done by
// lib/maps geocodeFull. Server-only (imports the territory engine which reads the DB).
import { haversineMiles } from '@/lib/geo';
import { LOCATIONS } from '@/lib/rankConfig';
import { learnedTowns } from '@/lib/territory';

// CB home base — Richmond, KY (license #M7707). The distance gate is measured from here.
export const BASE = { lat: 37.7479, lng: -84.2947 };
export const MAX_MILES = 40;

// City-name normalizer: drop ", Kentucky"/", KY" + punctuation → lowercase bare town.
export const normCity = (s) =>
  String(s || '').toLowerCase().replace(/,?\s*(kentucky|ky)\b.*$/i, '').replace(/[^a-z ]/g, '').trim();

// Towns CB actively serves: the rank-tracker LOCATIONS + the site's landing-page towns. learnedTowns()
// expands this at runtime from real jobs (≥5/mo), so the served set grows as the crew works new towns.
export const SERVED_SEED = new Set(
  [...LOCATIONS, 'Georgetown, KY', 'Versailles, KY', 'Irvine, KY'].map(normCity)
);

export async function servedCitySet(sb) {
  const set = new Set(SERVED_SEED);
  try {
    const towns = await learnedTowns(sb, { minJobs: 5 });
    (towns || []).forEach((t) => { const c = normCity(t); if (c) set.add(c); });
  } catch (_) {}
  return set;
}

// Assess a geocoded address against the service area.
// needsReview = unknown city OR farther than MAX_MILES from base.
export function assessServiceArea({ city, lat, lng }, servedSet) {
  const c = normCity(city);
  const inServedCity = !!c && servedSet.has(c);
  const distanceMi = (typeof lat === 'number' && typeof lng === 'number') ? haversineMiles(BASE.lat, BASE.lng, lat, lng) : null;
  const tooFar = distanceMi != null && distanceMi > MAX_MILES;
  const needsReview = !inServedCity || tooFar;
  return { city: c, inServedCity, distanceMi, tooFar, needsReview };
}
