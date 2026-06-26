// Inventory location resolver — the brain behind the Tools & Parts map. Takes search matches (serialized
// tools + per-location part counts) and resolves EACH to a physical location: a tech's latest van GPS, a
// shop's coords, or a vendor's coords. Then ranks by fastest-available. Pure (pass origin + the location
// indexes); no Date.now / fetch inside, so it's testable and runs the same server + client.
import { haversineMiles, etaMinutes, mapsDir } from './geo';

// Pin colors (spec): blue=origin (drawn separately), orange=best match, green=tech van, purple=shop,
// teal=vendor, gray=unavailable/unknown.
export const PIN = { tech: '#4caf50', shop: '#9c27b0', vendor: '#26a69a', job: '#90a4ae', unknown: '#90a4ae', best: '#ff8f00', origin: '#2196f3' };

const num = (v) => (typeof v === 'number' && !Number.isNaN(v) ? v : null);
const lc = (s) => String(s == null ? '' : s).trim().toLowerCase();
const TOOL_UNAVAILABLE = new Set(['reserved', 'loaned', 'out', 'broken', 'lost', 'retired', 'pickup_pending']);

// Resolve one holder → { lat, lng, label, fresh } using the indexes. techByKey is keyed by BOTH tech_id
// and lowercased name so tools that store either still resolve.
function resolveHolder(type, id, name, idx) {
  const t = lc(type);
  if (t === 'tech') {
    const rec = idx.techByKey.get(String(id)) || idx.techByKey.get(lc(name)) || idx.techByKey.get(lc(id));
    if (rec) return { lat: num(rec.lat), lng: num(rec.lng), label: `${rec.tech_name || name || 'Tech'}’s van`, battery: rec.battery, ageMin: rec.ageMin };
    return { lat: null, lng: null, label: `${name || 'A tech'}’s van (no GPS)` };
  }
  if (t === 'shop') { const s = idx.shopById.get(String(id)) || idx.shopById.get(lc(name)); return s ? { lat: num(s.lat), lng: num(s.lng), label: s.name || name || 'Shop', address: s.address } : { lat: null, lng: null, label: name || 'Shop' }; }
  if (t === 'vendor') { const v = idx.vendorById.get(String(id)) || idx.vendorById.get(lc(name)); return v ? { lat: num(v.lat), lng: num(v.lng), label: v.name || name || 'Vendor', address: v.address, phone: v.phone, hours: v.hours } : { lat: null, lng: null, label: name || 'Vendor' }; }
  if (t === 'job' || t === 'customer') return { lat: null, lng: null, label: 'On a job' };
  return { lat: null, lng: null, label: 'Unknown location' };
}

function locate(base, holderType, loc, origin) {
  const lat = loc.lat, lng = loc.lng;
  const distanceMi = origin && lat != null && lng != null ? haversineMiles(origin.lat, origin.lng, lat, lng) : null;
  const etaMin = distanceMi != null ? etaMinutes(distanceMi) : null;
  const pin = base.available ? (PIN[lc(holderType)] || PIN.unknown) : PIN.unknown;
  const mapsUrl = mapsDir({ destLat: lat, destLng: lng, destAddress: loc.address, originLat: origin?.lat, originLng: origin?.lng });
  return { ...base, holderType: lc(holderType), locLabel: loc.label, address: loc.address || null, phone: loc.phone || null, hours: loc.hours || null, lat, lng, distanceMi, etaMin, pin, mapsUrl, hasCoords: lat != null && lng != null };
}

// confidence: exact name contains the query token = high, alias-only = med, weak = low.
function confidenceOf(name, aliases, query) {
  const q = lc(query); if (!q) return 'med';
  if (lc(name).includes(q)) return 'high';
  if ((aliases || []).some((a) => lc(a).includes(q))) return 'med';
  return 'low';
}

export function resolveInventory({ tools = [], parts = [], origin = null, query = '', techByKey, shopById, vendorById }) {
  const idx = { techByKey: techByKey || new Map(), shopById: shopById || new Map(), vendorById: vendorById || new Map() };
  const out = [];

  for (const t of tools) {
    const holderType = t.current_holder_type || (t.assigned_to ? 'tech' : 'unknown');
    const holderId = t.current_holder_id || t.assigned_to || '';
    const holderName = t.current_holder_name || t.assigned_to || '';
    const status = lc(t.status);
    const available = !TOOL_UNAVAILABLE.has(status) && holderType !== 'unknown';
    const loc = resolveHolder(holderType, holderId, holderName, idx);
    out.push(locate({
      kind: 'tool', id: String(t.id), name: t.name || 'Tool', photo: t.condition_photo_url || null,
      holderId: String(holderId), holderName: holderName || loc.label, available,
      battery: t.battery ?? loc.battery ?? null, status: t.status || null,
      confidence: confidenceOf(t.name, t.aliases, query),
    }, holderType, loc, origin));
  }

  for (const p of parts) {
    const available = Number(p.qty) > 0;
    const loc = resolveHolder(p.location_type, p.location_id, p.location_name, idx);
    out.push(locate({
      kind: 'part', id: String(p.id), name: p.name || 'Part', photo: p.photo_url || null,
      holderId: String(p.location_id || ''), holderName: loc.label, available,
      qty: Number(p.qty) || 0, minQty: p.min_qty ?? null, bin: p.bin || null, sku: p.sku || null,
      confidence: confidenceOf(p.name, [p.sku], query),
    }, p.location_type, loc, origin));
  }

  // Rank: available first; then by ETA (known beats unknown); then confidence; vendors after tech/shop.
  const cRank = { high: 0, med: 1, low: 2 };
  const tierRank = (r) => (r.available ? 0 : 1);
  out.sort((a, b) =>
    tierRank(a) - tierRank(b) ||
    (a.etaMin == null) - (b.etaMin == null) ||
    (a.etaMin ?? 1e9) - (b.etaMin ?? 1e9) ||
    (cRank[a.confidence] ?? 3) - (cRank[b.confidence] ?? 3)
  );
  // Mark the single best available+coordinate match for the orange pin.
  const best = out.find((r) => r.available && r.hasCoords);
  if (best) best.best = true;
  return out;
}
