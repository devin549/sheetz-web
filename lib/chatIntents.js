// Parse #sheetz chatter for intents the system can act on automatically:
//  • a TOOL/PART request → resolve its location (P9) and post a link back.
// (Reschedule detection lives in lib/hankActions / detectRescheduleProposals — already wired in the
//  discord-sync cron.) Pure detector + a server-side resolver that reuses the inventory engine.
import { resolveInventory } from './inventoryLocate';
import { searchTools } from './tools';
import { mapsDir } from './geo';
import { getAnthropic, AI_MODEL, isAiConfigured } from './anthropic';

const lc = (s) => String(s == null ? '' : s).trim().toLowerCase();

// LEARN a colloquial tool name. When the literal/alias search misses, ask Claude which tool the slang
// means ("sewer machine"/"cable machine" → the drain machine; "scope" → the camera), then SAVE it as an
// alias so the next time anyone says it, it resolves instantly with no AI. Returns the matched tool or null.
export async function learnToolAlias(sb, query) {
  if (!isAiConfigured('owner')) return null;
  let tools = [];
  try { const { data } = await sb.from('tools').select('id, name, category').limit(200); tools = data || []; } catch (_) {}
  if (!tools.length) return null;
  const catalog = tools.map((t) => `${t.id} :: ${t.name}${t.category ? ` (${t.category})` : ''}`).join('\n');
  const system = 'You map a plumber\'s slang tool name to the exact tool in a catalog. A "sewer machine", "cable machine", "drain machine", or "snake machine" = a sectional/drum drain cleaner (K-60, K-750, etc). A "camera"/"scope"/"eye" = a sewer inspection camera. A "locator"/"wand" = a pipe locator. Reply with ONLY the matching catalog id, or the word NONE. Only answer when you are confident it is the SAME kind of tool.';
  const user = `Tech asked for: "${query}"\n\nCatalog (id :: name):\n${catalog}\n\nWhich id? Reply with just the id or NONE.`;
  try {
    const client = getAnthropic('owner');
    const res = await client.messages.create({ model: AI_MODEL, max_tokens: 60, system, messages: [{ role: 'user', content: user }] });
    const out = String(res.content?.[0]?.text || '').trim();
    const id = (out.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i) || [])[0];
    if (!id) return null;
    const tool = tools.find((t) => String(t.id) === id);
    if (!tool) return null;
    try { const { data: dupe } = await sb.from('tool_aliases').select('id').eq('tool_id', tool.id).ilike('alias', query).maybeSingle(); if (!dupe) await sb.from('tool_aliases').insert({ tool_id: tool.id, alias: query.slice(0, 60) }); } catch (_) {}
    return tool;
  } catch (_) { return null; }
}

// "anyone got a k-60?", "need a wax ring", "who has the jetter", "looking for 3/4 copper", "where's the
// locator". Returns { isRequest, query }. Tuned to avoid false-positives on chit-chat.
const TRIGGER = /\b(any(?:one|body)?\s+(?:got|have|has|with|carrying|holding)|who(?:'?s| has| got)|need(?:s|ed)?|looking for|where(?:'?s| is)?(?:\s+the)?|got any|grab(?:\s+(?:a|me))?)\b/i;
const NON_ITEM = /\b(here|on[\s-]?call|oncall|call|around|available|free|coming|going|lunch|there|help|idea|clue|update|eta|status|sec|minute|cash|change|signal|tonight|today|tomorrow|weekend|morning|afternoon)\b/i;

// Natural-language COMMANDS Captain Hook can act on (beyond tool requests). Returns the first match:
//  { kind: 'running_late' | 'need_help' | 'parts_run' | 'tool_request', query?, vendor? }  — or null.
const RE_LATE = /\b(running\s+late|gonna\s+be\s+late|i'?m\s+late|stuck\s+(?:on|here|at)|behind\s+schedule|delayed|back\s*ed?\s*up\s+here)\b/i;
const RE_HELP = /\b(need\s+(?:a\s+)?hand|send\s+(?:me\s+)?help|need\s+(?:a\s+)?second|need\s+back\s*up|need\s+another\s+(?:guy|tech|body|set\s+of\s+hands)|can\s+(?:someone|anybody)\s+help|send\s+(?:a\s+)?helper)\b/i;
const RE_PARTS = /\b(parts?\s+run|getting\s+parts|grab(?:bing)?\s+parts|on\s+a\s+parts?\s+run|running\s+to\s+(?:get|grab)\b|heading\s+to\s+(ferguson|home\s*depot|lowe'?s|hd\s*supply|the\s+shop|menards|supply\s*house|the\s+supply))/i;

export function detectCommand(text) {
  const t = String(text || '').trim();
  if (t.length < 4) return null;
  if (RE_LATE.test(t)) return { kind: 'running_late' };
  if (RE_HELP.test(t)) return { kind: 'need_help' };
  const pm = t.match(RE_PARTS);
  if (pm) return { kind: 'parts_run', vendor: (pm[2] || '').trim() || null };
  const tool = detectToolRequest(t);
  if (tool.isRequest) return { kind: 'tool_request', query: tool.query };
  return null;
}

export function detectToolRequest(text) {
  const t = String(text || '').trim();
  if (t.length < 4) return { isRequest: false };
  const m = t.match(TRIGGER);
  if (!m) return { isRequest: false };
  let q = t.slice(m.index + m[0].length)
    .replace(/[?!.,]+$/g, '')
    .replace(/\b(a|an|the|some|any|my|your|our|that|this|spare|extra|please|pls|on|in|truck|van|shop)\b/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  if (!q || q.length < 2 || NON_ITEM.test(q)) return { isRequest: false };
  return { isRequest: true, query: q.slice(0, 60) };
}

// Build location indexes + resolve a part/tool query to its best location (no origin — ranks by
// availability). Returns the top available located item, or null. Server-only (takes the admin client).
export async function resolveItemForChat(sb, query) {
  if (!sb || !query) return null;
  let tools = [], parts = [];
  try { const r = await searchTools(sb, query); tools = r.tools || []; } catch (_) {}
  try { const { data } = await sb.from('item_locations').select('*').ilike('name', `%${query}%`).limit(40); parts = data || []; } catch (_) {}
  // Miss on the literal/alias search? Let Claude learn the slang → save the alias → search again (now it hits).
  if (!tools.length && !parts.length) {
    const learned = await learnToolAlias(sb, query);
    if (learned) { try { const r2 = await searchTools(sb, query); tools = r2.tools || []; } catch (_) {} }
  }
  if (!tools.length && !parts.length) return null;

  const techByKey = new Map(), shopById = new Map(), vendorById = new Map();
  try { const { data } = await sb.from('tech_locations').select('tech_name, tech_id, lat, lng'); (data || []).forEach((r) => { if (r.tech_id) techByKey.set(String(r.tech_id), r); if (r.tech_name) techByKey.set(lc(r.tech_name), r); }); } catch (_) {}
  try { const { data } = await sb.from('shops').select('id, name, address, lat, lng'); (data || []).forEach((s) => { shopById.set(String(s.id), s); shopById.set(lc(s.name), s); }); } catch (_) {}
  try { const { data } = await sb.from('vendors').select('id, name, address, lat, lng, phone, hours'); (data || []).forEach((v) => { vendorById.set(String(v.id), v); vendorById.set(lc(v.name), v); }); } catch (_) {}

  const results = resolveInventory({ tools, parts, query, techByKey, shopById, vendorById });
  const best = results.find((r) => r.available) || results[0];
  if (!best) return null;
  return {
    name: best.name, kind: best.kind, locLabel: best.locLabel, available: best.available,
    qty: best.qty, mapsUrl: best.mapsUrl || mapsDir({ destAddress: best.address }),
  };
}
