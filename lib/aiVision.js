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
