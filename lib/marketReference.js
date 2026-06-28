// Phase 2b-i — Market Reference: SOURCED decision support that sits BESIDE the owner-set price.
// HARD HOUSE RULE: this module NEVER sets, writes, or auto-suggests a retail price. It only assembles
// a sourced reference (live material, BLS labor, an AI national range) for the owner to eyeball.
//
// This file holds the PURE logic (material rollup, BLS series-id, the reference-string formatting). The
// live calls (SerpAPI / BLS / Claude) live in marketReferenceActions.js so this stays unit-testable with
// no network + no Next runtime. Everything degrades gracefully when a source is unavailable.

// ── BLS labor benchmarking ──────────────────────────────────────────────────────────────────────────
// OES (Occupational Employment & Wage Statistics) for Plumbers/Pipefitters/Steamfitters, SOC 47-2152.
// CB works Richmond + Lexington KY → default metro is the Lexington-Fayette, KY MSA (area 30460). The
// BLS OES series id is fixed-width: prefix 'OE' + seasonal 'U' + area type + area code + SOC(6) + datatype.
//   seasonal:    'U' (OES is not seasonally adjusted)
//   areatype:    'M' = metropolitan area, 'N' = national
//   area:        7 digits, left-zero-padded (metro MSA code, e.g. 0030460; national = 0000000)
//   industry:    6 digits — '000000' = cross-industry (all owners of the occupation)
//   occupation:  6 digits SOC w/o dash — plumbers = '472152'
//   datatype:    2 digits — '04' = annual mean wage, '13' = hourly mean wage, '08' = hourly median
// Ref: BLS public data API series-id spec for the OE survey.

export const PLUMBER_SOC = '472152'; // SOC 47-2152, dash stripped
export const BLS_AREAS = {
  // Lexington-Fayette, KY MSA — CB's home metro (the labor benchmark we want by default).
  lexington: { code: '0030460', type: 'M', label: 'Lexington-Fayette, KY' },
  // Richmond KY is a micropolitan with no OES wage series → fall back to the state metro / national.
  richmond: { code: '0030460', type: 'M', label: 'Lexington-Fayette, KY (nearest metro to Richmond)' },
  national: { code: '0000000', type: 'N', label: 'United States' },
};

// Build a valid BLS OES series id. datatype default '13' = hourly mean wage (what we multiply by hours).
// Structure (25 chars): OE + U(seasonal) + areatype(1) + area(7) + industry(6) + soc(6) + datatype(2).
// e.g. Lexington plumbers hourly-mean = 'OEUM00304600000004721521' + '3' → 'OEUM003046000000047215213'.
// Pure + total-safe (pads/truncates inputs). NOTE: the Lexington MSA area code (0030460) should be
// validated against the live BLS catalog the first time a real BLS_API_KEY is wired (labor degrades to
// "no wage" if BLS doesn't recognize the id — it never blocks the rest of the reference).
export function blsSeriesId({ areaCode = '0030460', areaType = 'M', soc = PLUMBER_SOC, datatype = '13', industry = '000000' } = {}) {
  const pad = (s, n) => String(s == null ? '' : s).replace(/[^0-9]/g, '').padStart(n, '0').slice(-n);
  const at = String(areaType || 'M').toUpperCase() === 'N' ? 'N' : 'M';
  return `OEU${at}${pad(areaCode, 7)}${pad(industry, 6)}${pad(soc, 6)}${pad(datatype, 2)}`;
}

// Resolve which metro to benchmark against from a free-form hint (shop id, metro name, anything).
export function resolveBlsArea(hint) {
  const h = String(hint || '').toLowerCase();
  if (/lex|fayette/.test(h)) return BLS_AREAS.lexington;
  if (/rich|madison/.test(h)) return BLS_AREAS.richmond;
  if (/nation|us|united/.test(h)) return BLS_AREAS.national;
  return BLS_AREAS.lexington; // CB default home metro
}

// ── Material rollup from a service's learned parts ─────────────────────────────────────────────────────
// Prefer the parts the service has ALREADY learned (each carries a cached vendor_price). Sum the usable
// ones: Σ(vendor_price × qty), skipping rejected links and parts with no price. Returns the figure + how
// many priced parts contributed + which still need a price (so the UI can offer "look these up").
// This mirrors rollupMaterialCost in pricebookEngine but also reports the *gaps* for the live-lookup path.
export function materialFromLearnedParts(links = []) {
  let total = 0, priced = 0;
  const unpriced = [];
  for (const l of links) {
    const status = String(l?.status || '').toLowerCase();
    if (status === 'rejected') continue;
    const vp = Number(l?.vendor_price);
    const qty = Number(l?.quantity) > 0 ? Number(l.quantity) : 1;
    if (vp > 0) { total += vp * qty; priced += 1; }
    else if (l?.part_name) unpriced.push({ name: l.part_name, qty });
  }
  return { total: Math.round(total * 100) / 100, priced, unpriced };
}

// ── Reference-string formatting (what the editor shows beside the owner's price) ────────────────────────
const dollars0 = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');

// Assemble the one-line "Material ~$X (live) · Labor ~$Y (BLS) · typical range $A–$B (AI est.)" summary
// from whichever sources are present. Each piece is OMITTED (with no fakery) when its source is missing.
// `material`, `labor` = numbers or null; `range` = {low, high} or null. Returns { line, parts } where
// parts[] is the structured pieces (so the UI can render them with their own source labels + tooltips).
export function formatReference({ material = null, materialSource = 'live', labor = null, laborSource = 'BLS', range = null } = {}) {
  const parts = [];
  if (material != null && Number(material) > 0) parts.push({ kind: 'material', text: `Material ~${dollars0(material)}`, source: materialSource });
  if (labor != null && Number(labor) > 0) parts.push({ kind: 'labor', text: `Labor ~${dollars0(labor)}`, source: laborSource });
  if (range && Number(range.low) > 0 && Number(range.high) >= Number(range.low)) {
    parts.push({ kind: 'range', text: `typical range ${dollars0(range.low)}–${dollars0(range.high)}`, source: 'AI est.' });
  }
  const line = parts.map((p) => `${p.text} (${p.source})`).join(' · ');
  return { line, parts };
}

// Labor benchmark = hourly mean wage × the item's estimated labor hours. null if either is missing/zero.
// This is a benchmark of the *wage cost of the labor*, NOT a price — it never feeds a retail figure.
export function laborBenchmark(hourlyWage, laborHours) {
  const w = Number(hourlyWage) || 0, h = Number(laborHours) || 0;
  if (w <= 0 || h <= 0) return null;
  return Math.round(w * h * 100) / 100;
}

// Parse Claude's national-range reply defensively into {low, high}. Accepts {low,high} JSON or a "$A–$B"
// string. Returns null if it can't extract a sane ascending pair. Pure — never throws.
export function parseAiRange(raw) {
  if (raw == null) return null;
  const sane = (lo, hi) => Number.isFinite(lo) && Number.isFinite(hi) && lo > 0 && hi >= lo ? { low: lo, high: hi } : null;
  if (typeof raw === 'object' && raw.low != null && raw.high != null) {
    return sane(Number(raw.low), Number(raw.high));
  }
  const nums = String(raw).match(/\d[\d,]*(?:\.\d+)?/g);
  if (!nums || nums.length < 2) return null;
  return sane(Number(nums[0].replace(/,/g, '')), Number(nums[1].replace(/,/g, '')));
}
