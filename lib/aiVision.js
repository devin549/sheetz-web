// Claude Vision helpers. Reasoning/structuring over images (not bulk OCR — that stays on Google Vision).
// Always fail-soft: no key / bad image / bad output → null, and the UI shows a "couldn't read it" state.
import { getAnthropic, AI_MODEL, isAiConfigured } from '@/lib/anthropic';

// Split a data URL into { mime, base64 }. Returns null if it isn't a base64 image data URL.
function splitDataUrl(dataUrl) {
  const m = String(dataUrl || '').match(/^data:(image\/[a-z.+-]+);base64,(.+)$/i);
  return m ? { mime: m[1], base64: m[2] } : null;
}

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
