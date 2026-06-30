// Parse #sheetz chatter for intents the system can act on automatically:
//  • a TOOL/PART request → resolve its location (P9) and post a link back.
// (Reschedule detection lives in lib/hankActions / detectRescheduleProposals — already wired in the
//  discord-sync cron.) Pure detector + a server-side resolver that reuses the inventory engine.
import { resolveInventory } from './inventoryLocate';
import { searchTools } from './tools';
import { mapsDir } from './geo';
import { getAnthropic, AI_MODEL, isAiConfigured } from './anthropic';

const lc = (s) => String(s == null ? '' : s).trim().toLowerCase();

// LEARN a colloquial tool name — CONTEXT-AWARE. The same slang can mean different tools by job size:
// "cable machine"/"snake" on a kitchen/sink/lav = a small 1/4"–3/8" machine; on a main/sewer = the big
// sectional (K-60/K-750). So we pass the job type + the full message, let Claude pick the right SIZE, and
// only memorize an alias when the term is UNambiguous (so we never mislearn a size-dependent word).
// Returns the matched tool row (for this resolve) or null. ctx = { jobType, message }.
export async function learnToolAlias(sb, query, ctx = {}) {
  if (!isAiConfigured('owner')) return null;
  let tools = [];
  try { const { data } = await sb.from('tools').select('id, name, category').limit(200); tools = data || []; } catch (_) {}
  if (!tools.length) return null;
  const catalog = tools.map((t) => `${t.id} :: ${t.name}${t.category ? ` (${t.category})` : ''}`).join('\n');
  const system = [
    'You map a plumber\'s slang tool name to the exact tool in a catalog, using the JOB CONTEXT to get the SIZE right. Techs name drain machines three ways: by size, by line, or by BRAND — and often misspell brands.',
    'Brands = drain/cable machines: Gorlitz (e.g. "gorlitz", "gortliz", "go-68"), RIDGID/K-series (K-30/K-40/K-60/K-400/K-750), Spartan, General (Speedrooter, Mini-Rooter), Electric Eel. Treat any of these as a drain cleaning machine and still pick the SIZE from the job.',
    'Rules:',
    '• "cable machine" / "snake" / "drain machine" / a brand name, on a KITCHEN, SINK, LAV, TUB, SHOWER, or small 1.5"–2" line = a SMALL 1/4" or 3/8" machine (K-30, hand spinner, mini drum, Gorlitz Go-15).',
    '• "cable machine" / "sewer machine" / "main machine" / a brand name, on a MAIN, SEWER, YARD line, or 3"+ = a SECTIONAL/DRUM cleaner (K-60, K-750, Gorlitz Go-68).',
    '• "camera" / "scope" / "eye" = a sewer inspection camera. "locator" / "wand" = a pipe locator. "jetter" = a hydro-jetter.',
    'Reply with ONLY: "<id>" if confident and the term is unambiguous, "<id> AMBIGUOUS" if you had to use the job context to pick the size (the bare word alone is ambiguous), or "NONE".',
  ].join('\n');
  const jobLine = ctx.jobType ? `Current job type: "${ctx.jobType}". ` : '';
  const msgLine = ctx.message && ctx.message !== query ? `Full message: "${ctx.message}". ` : '';
  const user = `${jobLine}${msgLine}Tech asked for: "${query}"\n\nCatalog (id :: name):\n${catalog}\n\nReply.`;
  try {
    const client = getAnthropic('owner');
    const res = await client.messages.create({ model: AI_MODEL, max_tokens: 60, system, messages: [{ role: 'user', content: user }] });
    const out = String(res.content?.[0]?.text || '').trim();
    const id = (out.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i) || [])[0];
    if (!id) return null;
    const ambiguous = /\bambiguous\b/i.test(out);
    let full = null;
    try { const { data } = await sb.from('tools').select('id, name, category, status, assigned_to, current_holder_type, current_holder_id, current_holder_name, condition_photo_url').eq('id', id).maybeSingle(); full = data; } catch (_) {}
    if (!full) return null;
    // Memorize ONLY unambiguous terms (don't bake "cable machine" to one size). Ambiguous ones resolve
    // for THIS message via the job context, but stay AI-judged next time.
    if (!ambiguous) { try { const { data: dupe } = await sb.from('tool_aliases').select('id').eq('tool_id', full.id).ilike('alias', query).maybeSingle(); if (!dupe) await sb.from('tool_aliases').insert({ tool_id: full.id, alias: query.slice(0, 60) }); } catch (_) {} }
    return full;
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
// "running to get/grab" REQUIRES a parts-context noun — otherwise "running to grab lunch" / "running to get
// my kid" falsely started a billable parts-run clock. Vendor stays capture group 2 (the parts noun is non-capturing).
const RE_PARTS = /\b(parts?\s+run|getting\s+parts|grab(?:bing)?\s+parts|on\s+a\s+parts?\s+run|running\s+to\s+(?:get|grab)\s+(?:some\s+|a\s+|the\s+|more\s+)?(?:parts?|materials?|supplies|fittings?)\b|heading\s+to\s+(ferguson|home\s*depot|lowe'?s|hd\s*supply|the\s+shop|menards|supply\s*house|the\s+supply))/i;

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

// Stop-words to strip so the query is the ITEM noun, not the whole sentence. "Where are cameras at I need
// one" must reduce to "cameras", not "are cameras at i need one" (which the old version echoed back as a
// miss). Covers articles, pronouns, the request verbs themselves, and trailing "...I need one" tails.
const STOP = /\b(a|an|the|some|any|my|your|our|their|that|this|these|those|spare|extra|please|pls|on|in|at|to|for|of|with|from|truck|van|shop|i|we|you|me|us|they|he|she|guy|guys|man|bro|dude|need|needs|needed|want|one|ones|got|get|have|has|had|around|here|there|is|are|am|be|been|right|now|today|tonight|anybody|anyone|somebody|someone|it|can|could|would|come|coming|go|going|please|real|quick|asap)\b/gi;

export function detectToolRequest(text) {
  const t = String(text || '').trim();
  if (t.length < 4) return { isRequest: false };
  const m = t.match(TRIGGER);
  if (!m) return { isRequest: false };
  let q = t.slice(m.index + m[0].length)
    .replace(/[?!.,]+$/g, '')
    .replace(STOP, ' ')
    .replace(/\s+/g, ' ').trim();
  if (!q || q.length < 2 || NON_ITEM.test(q)) return { isRequest: false };
  return { isRequest: true, query: q.slice(0, 60) };
}

// Build location indexes + resolve a part/tool query to its best location (no origin — ranks by
// availability). Returns the top available located item, or null. Server-only (takes the admin client).
export async function resolveItemForChat(sb, query, ctx = {}) {
  if (!sb || !query) return null;
  let tools = [], parts = [];
  try { const r = await searchTools(sb, query); tools = r.tools || []; } catch (_) {}
  try { const { data } = await sb.from('item_locations').select('*').ilike('name', `%${query}%`).limit(40); parts = data || []; } catch (_) {}
  // Also resolve parts by their ALIASES (Reid's nicknames): alias → part name/sku → the stock rows.
  if (!parts.length) {
    try {
      const { data: al } = await sb.from('part_aliases').select('name, sku').ilike('alias', `%${query}%`).limit(10);
      const names = [...new Set((al || []).map((a) => a.name).filter(Boolean))];
      const skus = [...new Set((al || []).map((a) => a.sku).filter(Boolean))];
      if (names.length || skus.length) {
        let q = sb.from('item_locations').select('*');
        q = names.length && skus.length ? q.or(`name.in.(${names.map((n) => `"${n}"`).join(',')}),sku.in.(${skus.join(',')})`) : names.length ? q.in('name', names) : q.in('sku', skus);
        const { data } = await q.limit(40); parts = data || [];
      }
    } catch (_) {}
  }
  // Miss on the literal/alias search? Let Claude pick the right tool from context (kitchen vs main →
  // small vs big cable machine). Use the matched tool directly (ambiguous terms aren't saved as aliases).
  if (!tools.length && !parts.length) {
    const learned = await learnToolAlias(sb, query, ctx);
    if (learned) tools = [{ ...learned, aliases: [] }];
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
