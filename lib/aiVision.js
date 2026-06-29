// Claude Vision helpers. Reasoning/structuring over images (not bulk OCR — that stays on Google Vision).
// Always fail-soft: no key / bad image / bad output → null, and the UI shows a "couldn't read it" state.
import { getAnthropic, AI_MODEL, isAiConfigured } from '@/lib/anthropic';

// Split a data URL into { mime, base64 }. Returns null if it isn't a base64 image data URL.
function splitDataUrl(dataUrl) {
  const m = String(dataUrl || '').match(/^data:(image\/[a-z.+-]+);base64,(.+)$/i);
  return m ? { mime: m[1], base64: m[2] } : null;
}

const FIXTURE_PROMPT = `You are a master plumber looking at a photo from a customer's home. Identify the MAIN plumbing fixture or component in the photo so we can show its repairs and replacements. Return STRICT JSON only, no prose:
{"fixture":"<one of: toilet, faucet, sink, drain, garbage_disposal, water_heater, tankless, shower, tub, sump_pump, water_softener, supply_line, valve, p_trap, sewer_line, other>","label":"<short human label, e.g. 'two-piece toilet' or 'kitchen faucet'>","problem":"<the most likely issue if one is visible (e.g. 'leaking at base', 'corroded supply line'), else empty>","confidence":"high|medium|low"}
Pick the single best fixture. If you truly can't tell, use "other" with confidence "low".`;

const PLATE_PROMPT = `You are reading the rating/data plate on a plumbing appliance — usually a water heater (sometimes a furnace, boiler, or tankless unit). Read what is physically printed on the plate. Do NOT guess values that aren't shown.

Return STRICT JSON only, no prose:
{"brand":"","model":"","serial":"","fuelType":"NATURAL GAS|LP / PROPANE|ELECTRIC|UNKNOWN","capacityGallons":null,"year":null,"confidence":"high|medium|low","notes":""}

Rules:
- fuelType MUST be exactly one of those four strings. Water heater plates often print "NAT", "NG", "NATURAL" (= NATURAL GAS) or "LP", "PROPANE", "L.P." (= LP / PROPANE). If electric (no gas rating, shows kW/elements) = ELECTRIC. If you can't tell = UNKNOWN.
- capacityGallons = number if a gallon capacity is printed, else null.
- year = 4-digit manufacture year if printed or clearly derivable from the serial date code, else null.
- confidence reflects how clearly you could read the plate. If the image isn't a data plate, use "low" and say so in notes.
- notes = anything the tech should know (e.g. "plate partly glare-obscured", "serial date code = 1st week 2019").`;

const QA_PROMPT = (jobType, kinds) => `You are a practical plumbing-job QA reviewer. A field tech just took this photo as closeout proof for a "${jobType || 'service'}" job.${kinds && kinds.length ? ` The required shot kinds for this job are: ${kinds.join(', ')}.` : ''} Judge whether it's usable proof.

Return STRICT JSON only:
{"verdict":"pass|retake","detectedKind":"before|after|during|equipment|receipt|damage|other","showsWork":true,"quality":"good|usable|poor","issues":[],"suggestion":""}

Rules:
- verdict "retake" ONLY if it's genuinely bad: badly blurry, too dark to see, a finger/lens cover, or it clearly does NOT show the plumbing work/fixture/receipt at all. A real, usable photo of the work PASSES even if not perfect.
- detectedKind = your best guess at what this shot is.
- showsWork = does it actually show the relevant plumbing work, fixture, equipment, or receipt?
- issues = short list of concrete problems (empty if none).
- suggestion = one short line on how to improve the shot, or "" if it's good.
Be practical, not picky — the goal is to catch obviously-useless shots before a supervisor wastes time, not to reject decent field photos.`;

export async function reviewPhoto({ dataUrl, jobType = '', requiredKinds = [], role = 'tech' }) {
  if (!isAiConfigured(role)) return null;
  const img = splitDataUrl(dataUrl);
  if (!img) return null;
  try {
    const client = getAnthropic(role);
    if (!client) return null;
    const res = await client.messages.create({
      model: AI_MODEL, max_tokens: 350,
      messages: [{ role: 'user', content: [
        { type: 'text', text: QA_PROMPT(jobType, requiredKinds) },
        { type: 'image', source: { type: 'base64', media_type: img.mime, data: img.base64 } },
      ] }],
    });
    const text = (res?.content || []).map((b) => b.text || '').join('').trim();
    const j = JSON.parse((text.match(/\{[\s\S]*\}/) || [text])[0]);
    return {
      verdict: j.verdict === 'retake' ? 'retake' : 'pass',
      detectedKind: String(j.detectedKind || 'other').slice(0, 20),
      showsWork: j.showsWork !== false,
      quality: ['good', 'usable', 'poor'].includes(j.quality) ? j.quality : 'usable',
      issues: Array.isArray(j.issues) ? j.issues.map((s) => String(s).slice(0, 80)).slice(0, 5) : [],
      suggestion: String(j.suggestion || '').slice(0, 160),
    };
  } catch (_) { return null; }
}

// Identity verification only. We deliberately extract the MINIMUM: name + expiry + state. We do NOT read
// or store the license number, date of birth, or address — just enough to confirm the license belongs to
// this tech and isn't expired.
const LICENSE_PROMPT = `You are reading a US driver's license / state ID to verify a company employee's identity. Extract ONLY these fields and nothing else.

Return STRICT JSON only:
{"name":"","expiry":"YYYY-MM","state":"","isLicense":true,"confidence":"high|medium|low"}

Rules:
- name = the full name exactly as printed.
- expiry = expiration date as YYYY-MM (add -DD only if the day is clearly printed).
- state = the 2-letter US state abbreviation.
- isLicense = true only if this image is actually a driver's license or state ID card.
- DO NOT return the license/ID number, date of birth, address, height, weight, or any other field. Only name, expiry, state.`;

export async function readLicense(dataUrl, role = 'tech') {
  if (!isAiConfigured(role)) return null;
  const img = splitDataUrl(dataUrl);
  if (!img) return null;
  try {
    const client = getAnthropic(role);
    if (!client) return null;
    const res = await client.messages.create({
      model: AI_MODEL, max_tokens: 200,
      messages: [{ role: 'user', content: [
        { type: 'text', text: LICENSE_PROMPT },
        { type: 'image', source: { type: 'base64', media_type: img.mime, data: img.base64 } },
      ] }],
    });
    const text = (res?.content || []).map((b) => b.text || '').join('').trim();
    const j = JSON.parse((text.match(/\{[\s\S]*\}/) || [text])[0]);
    return {
      name: String(j.name || '').slice(0, 80),
      expiry: /^\d{4}-\d{2}(-\d{2})?$/.test(String(j.expiry)) ? String(j.expiry) : null,
      state: /^[A-Za-z]{2}$/.test(String(j.state)) ? String(j.state).toUpperCase() : null,
      isLicense: j.isLicense !== false,
      confidence: ['high', 'medium', 'low'].includes(j.confidence) ? j.confidence : 'low',
    };
  } catch (_) { return null; }
}

// Verify a submitted image IS a legitimate medical excuse document — WITHOUT reading the medical content.
// This keeps the excuse decision honest (no blank pages) while never creating a record of the diagnosis.
const DOC_PROMPT = `You are verifying that an employee submitted a LEGITIMATE medical excuse document (a doctor's note, clinic/urgent-care visit summary, or discharge paper) to excuse a work absence. Decide ONLY whether the image is such a document.

CRITICAL PRIVACY RULE: Do NOT read, infer, summarize, or output ANY medical information — no diagnosis, condition, symptoms, treatment, medication, or body part. If you notice any, ignore it. Only assess the document's legitimacy from its STRUCTURE (letterhead, provider name, signature, date).

Return STRICT JSON only:
{"isMedicalNote":true,"hasProviderName":true,"hasDate":true,"confidence":"high|medium|low","summary":"short NON-medical structural note, e.g. 'clinic letterhead, signed, dated' or 'blank page'"}`;

export async function verifyDocNote(dataUrl, role = 'tech') {
  if (!isAiConfigured(role)) return null;
  const img = splitDataUrl(dataUrl);
  if (!img) return null;
  try {
    const client = getAnthropic(role);
    if (!client) return null;
    const res = await client.messages.create({
      model: AI_MODEL, max_tokens: 180,
      messages: [{ role: 'user', content: [
        { type: 'text', text: DOC_PROMPT },
        { type: 'image', source: { type: 'base64', media_type: img.mime, data: img.base64 } },
      ] }],
    });
    const text = (res?.content || []).map((b) => b.text || '').join('').trim();
    const j = JSON.parse((text.match(/\{[\s\S]*\}/) || [text])[0]);
    return {
      isMedicalNote: j.isMedicalNote === true,
      hasProviderName: j.hasProviderName === true,
      hasDate: j.hasDate === true,
      confidence: ['high', 'medium', 'low'].includes(j.confidence) ? j.confidence : 'low',
      summary: String(j.summary || '').slice(0, 120),
    };
  } catch (_) { return null; }
}

// Read the ODOMETER (total miles) off a dashboard photo — for the end-of-shift / maintenance mileage fields.
const ODOMETER_PROMPT = `Read the main ODOMETER reading (total vehicle mileage) from this photo of a vehicle dashboard / instrument cluster. Rules: return the WHOLE-NUMBER odometer total in miles. IGNORE trip meters (Trip A / Trip B), the speedometer, fuel/RPM/temperature gauges, the clock, and any ".x" tenths. If multiple numbers are visible, pick the largest plausible total-mileage value (the odometer). Return STRICT JSON only: {"miles": <integer or null>, "confidence":"high|medium|low"}`;

export async function readOdometer(dataUrl, role = 'tech') {
  if (!isAiConfigured(role)) return null;
  const img = splitDataUrl(dataUrl);
  if (!img) return null;
  try {
    const client = getAnthropic(role);
    if (!client) return null;
    const res = await client.messages.create({
      model: AI_MODEL, max_tokens: 120,
      messages: [{ role: 'user', content: [
        { type: 'text', text: ODOMETER_PROMPT },
        { type: 'image', source: { type: 'base64', media_type: img.mime, data: img.base64 } },
      ] }],
    });
    const text = (res?.content || []).map((b) => b.text || '').join('').trim();
    const j = JSON.parse((text.match(/\{[\s\S]*\}/) || [text])[0]);
    const miles = Number(String(j.miles ?? '').replace(/[^\d]/g, ''));
    return { miles: Number.isFinite(miles) && miles > 0 ? miles : null, confidence: ['high', 'medium', 'low'].includes(j.confidence) ? j.confidence : 'low' };
  } catch (_) { return null; }
}

// 🧾 Read a parts/supply RECEIPT — vendor, total, date, line-item count. Used on the job's Parts/PO tab so a
// tech can snap a receipt and have the vendor + material cost auto-filled (it feeds the pay margin).
const RECEIPT_PROMPT = `You are reading a photo of a purchase RECEIPT or invoice. Most are for plumbing parts/supplies, but some are a SUBCONTRACTOR's labor bill (an outside company/person we hire — e.g. excavation, concrete, drywall, electrician, restoration) rather than a parts store. Return STRICT JSON only, no prose:
{"vendor":"<store/supplier/contractor name>","total":<grand total number, no $>,"date":"<YYYY-MM-DD or empty>","items":<count of line items, integer>,"is_subcontractor":<true|false>,"sub_name":"<the subcontractor/company name if it's a sub bill, else empty>","confidence":"high|medium|low","notes":"<short note, e.g. tax included>"}
Set is_subcontractor true ONLY if it clearly looks like an outside labor/service bill (invoice for labor/services, an "invoice #" from a contractor, not a parts-store receipt). If it's a normal parts/supply receipt (Ferguson, Home Depot, Winsupply, etc.) set it false. If you can't tell, set is_subcontractor false and confidence "low". If a field isn't legible, use "" (or 0 for total/items). The total is the FINAL amount.`;

export async function readReceipt(dataUrl, role = 'tech') {
  if (!isAiConfigured(role)) return null;
  const img = splitDataUrl(dataUrl);
  if (!img) return null;
  try {
    const client = getAnthropic(role);
    if (!client) return null;
    const res = await client.messages.create({
      model: AI_MODEL, max_tokens: 300,
      messages: [{ role: 'user', content: [
        { type: 'text', text: RECEIPT_PROMPT },
        { type: 'image', source: { type: 'base64', media_type: img.mime, data: img.base64 } },
      ] }],
    });
    const text = (res?.content || []).map((b) => b.text || '').join('').trim();
    const j = JSON.parse((text.match(/\{[\s\S]*\}/) || [text])[0]);
    const total = Number(String(j.total == null ? '' : j.total).replace(/[^\d.]/g, '')); // tolerate a stray $/comma
    return {
      vendor: String(j.vendor || '').slice(0, 80),
      total: Number.isFinite(total) && total >= 0 ? Math.round(total * 100) / 100 : 0,
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(j.date)) ? String(j.date) : '',
      items: Number.isInteger(Number(j.items)) ? Number(j.items) : 0,
      isSubcontractor: j.is_subcontractor === true,
      subName: String(j.sub_name || '').slice(0, 120),
      confidence: ['high', 'medium', 'low'].includes(j.confidence) ? j.confidence : 'low',
      notes: String(j.notes || '').slice(0, 200),
    };
  } catch (_) { return null; }
}

// 📸 Identify the plumbing fixture in a customer photo → fixture type + label + likely problem. Drives the
// "scan the pricebook" repairs/replacements view. One fast Vision call; fail-soft → null.
const FIXTURES = ['toilet', 'faucet', 'sink', 'drain', 'garbage_disposal', 'water_heater', 'tankless', 'shower', 'tub', 'sump_pump', 'water_softener', 'supply_line', 'valve', 'p_trap', 'sewer_line', 'other'];
export async function identifyFixture(dataUrl, role = 'tech') {
  if (!isAiConfigured(role)) return null;
  const img = splitDataUrl(dataUrl);
  if (!img) return null;
  try {
    const client = getAnthropic(role);
    if (!client) return null;
    const res = await client.messages.create({
      model: AI_MODEL, max_tokens: 200,
      messages: [{ role: 'user', content: [
        { type: 'text', text: FIXTURE_PROMPT },
        { type: 'image', source: { type: 'base64', media_type: img.mime, data: img.base64 } },
      ] }],
    });
    const text = (res?.content || []).map((b) => b.text || '').join('').trim();
    const j = JSON.parse((text.match(/\{[\s\S]*\}/) || [text])[0]);
    return {
      fixture: FIXTURES.includes(j.fixture) ? j.fixture : 'other',
      label: String(j.label || '').slice(0, 80),
      problem: String(j.problem || '').slice(0, 120),
      confidence: ['high', 'medium', 'low'].includes(j.confidence) ? j.confidence : 'low',
    };
  } catch (_) { return null; }
}

export async function readDataPlate(dataUrl, role = 'tech') {
  if (!isAiConfigured(role)) return null;
  const img = splitDataUrl(dataUrl);
  if (!img) return null;
  try {
    const client = getAnthropic(role);
    if (!client) return null;
    const res = await client.messages.create({
      model: AI_MODEL, max_tokens: 400,
      messages: [{ role: 'user', content: [
        { type: 'text', text: PLATE_PROMPT },
        { type: 'image', source: { type: 'base64', media_type: img.mime, data: img.base64 } },
      ] }],
    });
    const text = (res?.content || []).map((b) => b.text || '').join('').trim();
    const j = JSON.parse((text.match(/\{[\s\S]*\}/) || [text])[0]);
    const FUELS = ['NATURAL GAS', 'LP / PROPANE', 'ELECTRIC', 'UNKNOWN'];
    return {
      brand: String(j.brand || '').slice(0, 60),
      model: String(j.model || '').slice(0, 60),
      serial: String(j.serial || '').slice(0, 60),
      fuelType: FUELS.includes(j.fuelType) ? j.fuelType : 'UNKNOWN',
      capacityGallons: Number.isFinite(Number(j.capacityGallons)) ? Number(j.capacityGallons) : null,
      year: /^\d{4}$/.test(String(j.year)) ? String(j.year) : null,
      confidence: ['high', 'medium', 'low'].includes(j.confidence) ? j.confidence : 'low',
      notes: String(j.notes || '').slice(0, 240),
    };
  } catch (_) { return null; }
}
