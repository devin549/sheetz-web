// SerpAPI Google Lens — identify a part/product from a photo (public image URL). Needs SERPAPI_KEY.
export async function lensIdentify(imageUrl) {
  const key = process.env.SERPAPI_KEY;
  if (!key) return { ok: false, msg: 'SERPAPI_KEY not set', matches: [] };
  try {
    const url = `https://serpapi.com/search.json?engine=google_lens&type=all&url=${encodeURIComponent(imageUrl)}&api_key=${key}`;
    const r = await fetch(url, { cache: 'no-store' });
    const j = await r.json();
    const vm = j.visual_matches || [];
    const matches = vm.slice(0, 10).map((m) => ({
      title: m.title || '', source: m.source || '', thumbnail: m.thumbnail || '', link: m.link || '',
      price: (m.price && (m.price.extracted_value || m.price.value)) || null,
    })).filter((m) => m.title);
    // Best-guess label + keywords to search the pricebook with.
    const guess = (j.knowledge_graph && j.knowledge_graph[0] && j.knowledge_graph[0].title) || matches[0]?.title || '';
    return { ok: true, matches, guess };
  } catch (e) { return { ok: false, msg: String(e.message || e), matches: [] }; }
}
