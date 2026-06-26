// SerpAPI vendor pricing — given a part name, pull live retail prices (Home Depot / Lowe's / Google
// Shopping) so we can price a service's bill-of-materials WITHOUT ServiceTitan part numbers. Needs
// SERPAPI_KEY. Returns sellers + a cheapest/typical summary so margin-watch can see when parts cost rises.
const PREFERRED = [/home ?depot/i, /lowe/i, /ferguson/i, /menards/i, /supply/i, /grainger/i];

function priceNum(p) {
  if (p == null) return null;
  if (typeof p === 'object') return Number(p.extracted_value ?? p.value) || null;
  const m = String(p).match(/[\d,]+(\.\d+)?/);
  return m ? Number(m[0].replace(/,/g, '')) : null;
}

export const serpVendorConfigured = () => !!process.env.SERPAPI_KEY;

// Home Depot engine — cleaner part data (real HD SKUs/prices) than generic shopping. Returns [] on miss.
async function homeDepot(q, key) {
  try {
    const url = `https://serpapi.com/search.json?engine=home_depot&q=${encodeURIComponent(q)}&api_key=${key}`;
    const r = await fetch(url, { cache: 'no-store' });
    const j = await r.json();
    return ((j && j.products) || [])
      .map((p) => ({ seller: 'Home Depot', title: p.title || '', price: priceNum(p.price), link: p.link || p.product_link || '' }))
      .filter((s) => s.price && s.price > 0);
  } catch (_) { return []; }
}

// vendorPrices('wax ring') → { ok, sellers:[{seller,title,price,link}], cheapest, typical }. Tries the
// Home Depot engine first, then merges Google Shopping (Lowe's/Ferguson/etc) so we get the full market.
export async function vendorPrices(partName, { limit = 10 } = {}) {
  const key = process.env.SERPAPI_KEY;
  const q = String(partName || '').trim();
  if (!key) return { ok: false, msg: 'SERPAPI_KEY not set', sellers: [] };
  if (!q) return { ok: false, msg: 'No part name.', sellers: [] };
  try {
    const hd = await homeDepot(q, key);
    const url = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(q + ' plumbing')}&api_key=${key}`;
    const r = await fetch(url, { cache: 'no-store' });
    const j = await r.json();
    const shop = ((j && j.shopping_results) || [])
      .map((p) => ({ seller: p.source || '', title: p.title || '', price: priceNum(p.price ?? p.extracted_price), link: p.product_link || p.link || '' }))
      .filter((s) => s.price && s.price > 0);
    let sellers = hd.concat(shop);
    // Prefer real plumbing suppliers, then sort by price.
    sellers.sort((a, b) => {
      const pa = PREFERRED.findIndex((re) => re.test(a.seller)); const pb = PREFERRED.findIndex((re) => re.test(b.seller));
      const ra = pa < 0 ? 99 : pa, rb = pb < 0 ? 99 : pb;
      return ra - rb || a.price - b.price;
    });
    sellers = sellers.slice(0, limit);
    const prices = sellers.map((s) => s.price).sort((a, b) => a - b);
    const cheapest = prices[0] ?? null;
    const typical = prices.length ? prices[Math.floor(prices.length / 2)] : null; // median
    return { ok: true, sellers, cheapest, typical };
  } catch (e) { return { ok: false, msg: String(e?.message || e).slice(0, 160), sellers: [] }; }
}
