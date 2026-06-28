// AI cross-sell seeding — pick, for each target item, the catalog items a plumber commonly ADDS with it.
// Constrained to REAL catalog items (Claude returns indices into a vocabulary we give it; we validate every
// index server-side), so it can never invent a product. Fail-soft: any error / no key / bad output → {}.
import { getAnthropic, isAiConfigured } from '@/lib/anthropic';

// Bulk classification over the whole book → use a fast, cheap model. Quality is fine for "what pairs with
// what," and learned-from-real-jobs data overtakes these picks anyway.
const SEED_MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM = `You are a master plumber building cross-sell suggestions for a plumbing pricebook. For each TARGET service, pick the items a smart plumber most commonly ADDS or upsells on that same visit — real, related add-ons (parts, adjacent repairs, protection), NOT random items. Choose ONLY from the numbered CATALOG. Never pick the target itself. Prefer 3-5 picks; fewer is fine if nothing fits. Output STRICT JSON only: an object mapping each target's number (as a string) to an array of catalog numbers, e.g. {"12":[3,40,7],"15":[]}. No prose.`;

// catalog: [{ i, name }] (the allowed vocabulary). targets: [{ i, name, desc }] (subset to classify).
// Returns { [targetIndex:number]: number[] } — validated indices (real, not self, deduped, ≤6).
export async function suggestCrossSell(role, catalog, targets) {
  if (!isAiConfigured(role) || !catalog?.length || !targets?.length) return {};
  const client = getAnthropic(role);
  if (!client) return {};
  const valid = new Set(catalog.map((c) => c.i));
  const cat = catalog.map((c) => `${c.i}: ${c.name}`).join('\n').slice(0, 60000);
  const tg = targets.map((t) => `#${t.i}: ${t.name}${t.desc ? ' — ' + String(t.desc).slice(0, 90) : ''}`).join('\n');
  const user = `CATALOG (pick only these numbers):\n${cat}\n\nTARGETS:\n${tg}\n\nReturn the JSON map.`;
  try {
    const res = await client.messages.create({ model: SEED_MODEL, max_tokens: 1500, system: SYSTEM, messages: [{ role: 'user', content: user }] });
    const text = (res?.content || []).map((b) => b.text || '').join('').trim();
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return {};
    const raw = JSON.parse(m[0]);
    const out = {};
    for (const t of targets) {
      const picks = Array.isArray(raw[String(t.i)]) ? raw[String(t.i)] : [];
      const seen = new Set();
      out[t.i] = picks
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n !== t.i && valid.has(n) && !seen.has(n) && seen.add(n))
        .slice(0, 6);
    }
    return out;
  } catch (_) { return {}; }
}
