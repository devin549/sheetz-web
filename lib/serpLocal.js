// SerpAPI google_local → where a business ranks in the local pack for a keyword in a town. Needs SERPAPI_KEY.
import { BIZ_MATCH } from './rankConfig';

export async function localRank(keyword, location) {
  const key = process.env.SERPAPI_KEY;
  if (!key) return { ok: false, msg: 'SERPAPI_KEY not set' };
  try {
    const url = `https://serpapi.com/search.json?engine=google_local&google_domain=google.com&hl=en&gl=us&q=${encodeURIComponent(keyword)}&location=${encodeURIComponent(location)}&api_key=${key}`;
    const r = await fetch(url, { cache: 'no-store' });
    const j = await r.json();
    const results = j.local_results || [];
    let position = 0;
    const competitors = [];
    results.forEach((x, i) => {
      const pos = i + 1;
      if (BIZ_MATCH.test(x.title || '')) position = pos;
      if (competitors.length < 5) competitors.push({ name: x.title, rating: x.rating || null, reviews: x.reviews || null, position: pos });
    });
    return { ok: true, found: position > 0, position: position || null, totalShown: results.length, competitors };
  } catch (e) { return { ok: false, msg: String(e.message || e) }; }
}
