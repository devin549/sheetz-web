// Pull recent reviews for the CB Google Business listing via the Places API Details endpoint (reuses
// GOOGLE_MAPS_KEY; needs GOOGLE_PLACE_ID = the business's Place ID). Returns normalized reviews or [].
// Note: Places Details returns up to ~5 of the most relevant/recent reviews — good for a steady watcher;
// the full back-catalog needs the Google Business Profile API (OAuth), a later upgrade. Server-only.

export const reviewsConfigured = () => !!(process.env.GOOGLE_MAPS_KEY && process.env.GOOGLE_PLACE_ID);

export async function fetchPlaceReviews() {
  const key = process.env.GOOGLE_MAPS_KEY, place = process.env.GOOGLE_PLACE_ID;
  if (!key || !place) return { ok: false, reason: 'missing GOOGLE_PLACE_ID or GOOGLE_MAPS_KEY', reviews: [] };
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(place)}&fields=reviews,rating,user_ratings_total&reviews_sort=newest&key=${key}`;
    const r = await fetch(url);
    const j = await r.json();
    if (j.status !== 'OK') return { ok: false, reason: j.status || 'error', reviews: [] };
    const reviews = (j.result?.reviews || []).map((rv) => ({
      author: String(rv.author_name || '').trim(),
      rating: Number(rv.rating) || 0,
      text: String(rv.text || '').trim(),
      time: Number(rv.time) || 0,            // unix seconds
      source: 'Google',
    })).filter((rv) => rv.rating > 0);
    return { ok: true, reviews, placeRating: j.result?.rating, total: j.result?.user_ratings_total };
  } catch (e) { return { ok: false, reason: String(e?.message || e), reviews: [] }; }
}
