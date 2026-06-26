// Server-side Google Maps helpers (reuses GOOGLE_MAPS_KEY — the same key booking's verifyAddress uses).
// Geocoding for fixed locations + Distance Matrix for true drive-time ranking. All fail-soft: if the key
// is missing or Google errors, callers fall back to the haversine estimate in lib/geo.js. Server-only.

const KEY = () => process.env.GOOGLE_MAPS_KEY || '';
export const mapsConfigured = () => !!KEY();

// Geocode a free-text address → { lat, lng, formatted } or null.
export async function geocodeAddress(address) {
  const key = KEY(); const q = String(address || '').trim();
  if (!key || !q) return null;
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&region=us&key=${key}`);
    const j = await r.json();
    if (j.status !== 'OK' || !j.results?.length) return null;
    const loc = j.results[0].geometry?.location;
    return loc ? { lat: loc.lat, lng: loc.lng, formatted: j.results[0].formatted_address } : null;
  } catch { return null; }
}

// Geocode → full structured result { formatted, street, city, state, zip, lat, lng, partial, hasStreetNumber } or null.
// Used by the public address-verify door (and reusable by the office booking screen).
export async function geocodeFull(address) {
  const key = KEY(); const q = String(address || '').trim();
  if (!key || !q) return null;
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&region=us&key=${key}`);
    const j = await r.json();
    if (j.status !== 'OK' || !j.results?.length) return null;
    const res = j.results[0];
    const comp = (t) => res.address_components.find((x) => x.types.includes(t)) || null;
    const sn = comp('street_number'), route = comp('route');
    const city = comp('locality') || comp('sublocality') || comp('postal_town');
    const st = comp('administrative_area_level_1'), zip = comp('postal_code');
    const loc = res.geometry?.location;
    return {
      formatted: res.formatted_address,
      street: [sn?.long_name, route?.long_name].filter(Boolean).join(' ') || null,
      city: city?.long_name || null, state: st?.short_name || null, zip: zip?.long_name || null,
      lat: loc?.lat ?? null, lng: loc?.lng ?? null,
      partial: !!res.partial_match, hasStreetNumber: !!sn,
    };
  } catch { return null; }
}

// Distance Matrix: one origin → many destinations. Returns an array aligned to `dests` of
// { distanceMi, etaMin } (or null per element when Google can't route it). null overall on key/error.
export async function driveMatrix(origin, dests) {
  const key = KEY();
  if (!key || !origin || !Number.isFinite(origin.lat) || !dests?.length) return null;
  const withCoords = dests.map((d, i) => ({ i, d })).filter(({ d }) => d && Number.isFinite(d.lat) && Number.isFinite(d.lng));
  if (!withCoords.length) return null;
  const destParam = withCoords.map(({ d }) => `${d.lat},${d.lng}`).join('|');
  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin.lat},${origin.lng}&destinations=${encodeURIComponent(destParam)}&units=imperial&departure_time=now&key=${key}`;
    const r = await fetch(url);
    const j = await r.json();
    if (j.status !== 'OK' || !j.rows?.[0]?.elements) return null;
    const out = new Array(dests.length).fill(null);
    j.rows[0].elements.forEach((el, k) => {
      const orig = withCoords[k]; if (!orig) return;
      if (el.status === 'OK') {
        const secs = (el.duration_in_traffic || el.duration)?.value;
        out[orig.i] = { distanceMi: el.distance ? Math.round((el.distance.value / 1609.34) * 10) / 10 : null, etaMin: Number.isFinite(secs) ? Math.max(1, Math.round(secs / 60)) : null };
      }
    });
    return out;
  } catch { return null; }
}
