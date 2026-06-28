// Find real product photos by name/model via SerpAPI. Used to auto-populate pricebook item photos
// (e.g. a Rheem water heater by its model number). Needs SERPAPI_KEY.
export const serpConfigured = () => !!process.env.SERPAPI_KEY;

// Engines the media manager exposes. Default google_shopping (product-focused, best for SKUs/models).
export const PHOTO_ENGINES = {
  google_shopping: { label: 'Shopping', results: 'shopping_results' },
  google_images: { label: 'Images', results: 'images_results' },
  yandex_images: { label: 'Yandex', results: 'images_results' },
  google_lens: { label: 'Lens (reverse)', results: 'visual_matches' },
};

async function serpGet(params) {
  const key = process.env.SERPAPI_KEY;
  if (!key) return null;
  try {
    const qs = new URLSearchParams({ gl: 'us', hl: 'en', ...params, api_key: key }).toString();
    const rr = await fetch(`https://serpapi.com/search.json?${qs}`, { cache: 'no-store' });
    return await rr.json();
  } catch { return null; }
}

// Normalize whatever a given engine returns into [{ url, title, source, price }].
function pull(j, engine) {
  if (!j) return [];
  if (engine === 'google_shopping') {
    return ((j.shopping_results) || []).map((p) => ({ url: p.thumbnail, title: p.title, source: p.source, price: p.price }));
  }
  if (engine === 'google_lens') {
    return ((j.visual_matches) || []).map((p) => ({ url: p.thumbnail || p.image, title: p.title, source: p.source, price: p.price?.value }));
  }
  // google_images + yandex_images both use images_results
  return ((j.images_results) || []).map((p) => ({ url: p.original || p.thumbnail, title: p.title, source: p.source }));
}

// Search candidate photos for a text query, on a chosen engine (with a sensible cross-engine fallback so
// a thin result set still returns something to pick from).
export async function findProductPhotos(query, { limit = 8, engine = 'google_shopping' } = {}) {
  if (!serpConfigured()) return { ok: false, msg: 'SERPAPI_KEY not set', photos: [] };
  const q = String(query || '').trim();
  if (!q) return { ok: false, msg: 'Empty query.', photos: [] };
  const eng = PHOTO_ENGINES[engine] ? engine : 'google_shopping';

  let photos = pull(await serpGet({ engine: eng, q }), eng).filter((p) => p.url);
  // If the chosen engine came up thin, top it up from Google Images (never for Lens — that's a reverse search).
  if (photos.length < 3 && eng !== 'google_images' && eng !== 'google_lens') {
    photos = photos.concat(pull(await serpGet({ engine: 'google_images', q }), 'google_images').filter((p) => p.url));
  }
  const seen = new Set(); photos = photos.filter((p) => (seen.has(p.url) ? false : seen.add(p.url)));
  return { ok: true, photos: photos.slice(0, limit), engine: eng };
}

// "More like this" — reverse-image search on an EXISTING image url (Google Lens or Yandex). Returns visually
// similar product photos so the owner can swap a so-so photo for a sharper one of the same part.
export async function findSimilarPhotos(imageUrl, { limit = 8, engine = 'google_lens' } = {}) {
  if (!serpConfigured()) return { ok: false, msg: 'SERPAPI_KEY not set', photos: [] };
  const url = String(imageUrl || '').trim();
  if (!/^https?:\/\//.test(url)) return { ok: false, msg: 'Need an image to match.', photos: [] };
  const eng = engine === 'yandex_images' ? 'yandex_images' : 'google_lens';
  // Both engines take the source image via `url`; Lens returns visual_matches, Yandex returns images_results.
  const j = await serpGet(eng === 'google_lens' ? { engine: 'google_lens', url } : { engine: 'yandex_images', url });
  let photos = pull(j, eng).filter((p) => p.url);
  const seen = new Set(); photos = photos.filter((p) => (seen.has(p.url) ? false : seen.add(p.url)));
  return { ok: true, photos: photos.slice(0, limit), engine: eng };
}
