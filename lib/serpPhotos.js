// Find real product photos by name/model via SerpAPI (Google Shopping → Google Images fallback). Used to
// auto-populate pricebook item photos (e.g. a Rheem water heater by its model number). Needs SERPAPI_KEY.
export const serpConfigured = () => !!process.env.SERPAPI_KEY;

export async function findProductPhotos(query, { limit = 8 } = {}) {
  const key = process.env.SERPAPI_KEY;
  if (!key) return { ok: false, msg: 'SERPAPI_KEY not set', photos: [] };
  const q = String(query || '').trim();
  if (!q) return { ok: false, msg: 'Empty query.', photos: [] };

  const get = async (engine, extra = '') => {
    try {
      const url = `https://serpapi.com/search.json?engine=${engine}&gl=us&hl=en&q=${encodeURIComponent(q)}${extra}&api_key=${key}`;
      const r = await fetch(url, { cache: 'no-store' });
      return await r.json();
    } catch { return null; }
  };

  // Google Shopping = product-focused (best for SKUs/models).
  let j = await get('google_shopping');
  let photos = ((j && j.shopping_results) || []).map((p) => ({ url: p.thumbnail, title: p.title, source: p.source, price: p.price })).filter((p) => p.url);
  // Fallback: Google Images.
  if (photos.length < 3) {
    const j2 = await get('google_images');
    const more = ((j2 && j2.images_results) || []).map((p) => ({ url: p.original || p.thumbnail, title: p.title, source: p.source })).filter((p) => p.url);
    photos = photos.concat(more);
  }
  // De-dup by url.
  const seen = new Set(); photos = photos.filter((p) => (seen.has(p.url) ? false : seen.add(p.url)));
  return { ok: true, photos: photos.slice(0, limit) };
}
