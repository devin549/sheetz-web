// SerpAPI google_local → local businesses (name/address/phone/website/rating) for B2B lead finding.
export async function findLocalBusinesses(query, location) {
  const key = process.env.SERPAPI_KEY;
  if (!key) return { ok: false, msg: 'SERPAPI_KEY not set', results: [] };
  try {
    const url = `https://serpapi.com/search.json?engine=google_local&google_domain=google.com&hl=en&gl=us&q=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}&api_key=${key}`;
    const r = await fetch(url, { cache: 'no-store' });
    const j = await r.json();
    const results = (j.local_results || []).map((x) => ({
      name: x.title || '', address: x.address || '', phone: x.phone || '',
      website: (x.links && x.links.website) || x.website || '',
      rating: x.rating || null, reviews: x.reviews || null, placeId: x.place_id || '',
    })).filter((x) => x.name);
    return { ok: true, results };
  } catch (e) { return { ok: false, msg: String(e.message || e), results: [] }; }
}

// Lead-type buckets that need a lot of plumbing.
export const LEAD_CATEGORIES = [
  'apartment complexes', 'property management companies', 'homeowners associations',
  'restaurants', 'hotels', 'churches', 'schools', 'gyms', 'car washes', 'laundromats', 'nursing homes',
];
