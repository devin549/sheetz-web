// SerpAPI extras — the tech-facing engines beyond vendor pricing (serpVendor.js):
//   • supplierStatuses(sb)  — live OPEN/CLOSED + closing time + phone for CB's suppliers (google_maps engine).
//     Weekly hours + phone are STABLE, so they cache in kv_cache for 3 days (mig 168) and open-now is
//     computed at render from the cached hours — ~4 searches every 3 days, not per page view.
//   • findManuals(brand, model) — installation/service manual + parts-list links for a scanned data plate
//     (google engine, 1 search per tap).
// All fail-soft: no key / no cache table / parse miss → empty results, never an error page.

const KEY = () => process.env.SERPAPI_KEY;
const CB_AREA = process.env.CB_LOCATION || 'Richmond, Kentucky, United States';

// The suppliers CB actually buys from — the Maps query finds the NEAREST branch of each.
const SUPPLIERS = [
  { key: 'homedepot', label: 'Home Depot', q: 'Home Depot near Richmond KY' },
  { key: 'lowes', label: "Lowe's", q: "Lowe's Home Improvement near Richmond KY" },
  { key: 'ferguson', label: 'Ferguson', q: 'Ferguson Plumbing Supply near Richmond KY' },
  { key: 'wiseway', label: 'Wiseway', q: 'Wiseway Supply Kentucky' },
];

const CACHE_KEY = 'supplier_hours_v1';
const CACHE_TTL_MS = 3 * 24 * 3600 * 1000; // weekly hours are stable — refetch every 3 days

// ── kv_cache helpers (mig 168) — absent table → nulls, callers fetch live or skip ──
async function cacheGet(sb, key) {
  try { const { data } = await sb.from('kv_cache').select('value, updated_at').eq('key', key).maybeSingle(); return data || null; }
  catch (_) { return null; }
}
async function cacheSet(sb, key, value) {
  try { await sb.from('kv_cache').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' }); } catch (_) {}
}

// Pull one supplier's card off the Maps engine → { label, name, phone, address, hours:{monday:"6 AM–10 PM",…} }.
async function fetchSupplier(s) {
  try {
    const url = `https://serpapi.com/search.json?engine=google_maps&type=search&q=${encodeURIComponent(s.q)}&api_key=${KEY()}`;
    const r = await fetch(url, { cache: 'no-store' });
    const j = await r.json();
    const p = j.place_results || (Array.isArray(j.local_results) ? j.local_results[0] : null);
    if (!p) return null;
    // operating_hours arrives as { monday: '6 AM–10 PM', ... } (or hours[] rows) — normalize to that map.
    let hours = p.operating_hours && !Array.isArray(p.operating_hours) ? p.operating_hours : null;
    if (!hours && Array.isArray(p.hours)) { hours = {}; p.hours.forEach((h) => { const k = Object.keys(h)[0]; if (k) hours[String(k).toLowerCase()] = h[k]; }); }
    return { key: s.key, label: s.label, name: p.title || s.label, phone: p.phone || '', address: p.address || '', hours: hours || null, openStateRaw: p.open_state || '' };
  } catch (_) { return null; }
}

// "6 AM–10 PM" (or "7:30 AM–5 PM") for TODAY → { open, until, opensAt } computed in ET right now.
function openNow(hoursMap) {
  if (!hoursMap) return null;
  try {
    const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][nowET.getDay()];
    const raw = String(hoursMap[day] || '').trim();
    if (!raw) return null;
    if (/closed/i.test(raw)) return { open: false, until: null, opensAt: null, raw };
    if (/24 hours/i.test(raw)) return { open: true, until: 'midnight', opensAt: null, raw };
    const m = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*[–-]\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
    if (!m) return { open: null, until: null, opensAt: null, raw }; // unparseable → show raw text, no verdict
    const toMin = (h, mm, ap) => ((Number(h) % 12) + (/pm/i.test(ap) ? 12 : 0)) * 60 + (Number(mm) || 0);
    const start = toMin(m[1], m[2], m[3]), end = toMin(m[4], m[5], m[6]);
    const cur = nowET.getHours() * 60 + nowET.getMinutes();
    const fmt = (min) => { const h24 = Math.floor(min / 60), mm = min % 60; const ap = h24 >= 12 ? 'PM' : 'AM'; const h = h24 % 12 || 12; return `${h}${mm ? ':' + String(mm).padStart(2, '0') : ''} ${ap}`; };
    const open = cur >= start && cur < end;
    return { open, until: open ? fmt(end) : null, opensAt: !open ? fmt(start) : null, raw };
  } catch (_) { return null; }
}

// The strip's data: [{ label, name, address, phone, open:true|false|null, until, opensAt }]. Cached; [] on miss.
export async function supplierStatuses(sb) {
  if (!KEY() || !sb) return [];
  let cards = null;
  const hit = await cacheGet(sb, CACHE_KEY);
  if (hit && hit.value && Array.isArray(hit.value.cards) && Date.now() - new Date(hit.updated_at).getTime() < CACHE_TTL_MS) {
    cards = hit.value.cards;
  } else {
    const fresh = (await Promise.all(SUPPLIERS.map(fetchSupplier))).filter(Boolean);
    if (fresh.length) { cards = fresh; await cacheSet(sb, CACHE_KEY, { cards: fresh }); }
    else if (hit?.value?.cards) cards = hit.value.cards; // fetch failed → serve stale over nothing
  }
  if (!cards) return [];
  return cards.map((c) => { const st = openNow(c.hours); return { ...c, open: st ? st.open : null, until: st?.until || null, opensAt: st?.opensAt || null, todayRaw: st?.raw || '' }; });
}

// 📖 Manual + parts-list links for a scanned plate. One google-engine search per tap; top 5 links,
// manufacturer/PDF results first.
export async function findManuals(brand, model) {
  if (!KEY()) return { ok: false, msg: 'Search isn’t configured.', links: [] };
  const b = String(brand || '').trim(), m = String(model || '').trim();
  if (!b && !m) return { ok: false, msg: 'Scan the plate first — need a brand/model.', links: [] };
  try {
    const q = `${b} ${m} installation manual parts list`;
    const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(q)}&location=${encodeURIComponent(CB_AREA)}&num=10&api_key=${KEY()}`;
    const r = await fetch(url, { cache: 'no-store' });
    const j = await r.json();
    let links = ((j && j.organic_results) || [])
      .map((o) => ({ title: String(o.title || '').slice(0, 120), link: o.link || '', snippet: String(o.snippet || '').slice(0, 140), pdf: /\.pdf(\?|$)/i.test(o.link || '') }))
      .filter((o) => /^https:\/\//.test(o.link));
    // Manufacturer + PDF hits first — those ARE the manual, not a parts-store listing.
    const brandRe = b ? new RegExp(b.replace(/[^a-z0-9]/gi, ''), 'i') : null;
    links.sort((a, x) => ((x.pdf ? 2 : 0) + (brandRe && brandRe.test((x.link || '').replace(/[^a-z0-9]/gi, '')) ? 1 : 0)) - ((a.pdf ? 2 : 0) + (brandRe && brandRe.test((a.link || '').replace(/[^a-z0-9]/gi, '')) ? 1 : 0)));
    return { ok: true, links: links.slice(0, 5) };
  } catch (e) { return { ok: false, msg: String(e?.message || e).slice(0, 120), links: [] }; }
}
