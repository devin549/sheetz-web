// Chat-learned asset locations (STOPGAP until the live asset tracker ships). Reads the #general logistics
// channel, and for each move-ish message lets Claude pull out {asset, kind, action, location, holder} so Hank
// can answer "where's the 17G?". Server-only. Gated on the bot token (+ DISCORD_GENERAL_CHANNEL_ID) and the
// owner Claude key. Best-effort everywhere — never throws into the cron.
import { fetchChannelMessages } from '@/lib/discord';
import { getAnthropic, AI_MODEL, isAiConfigured } from '@/lib/anthropic';

export const generalChannelId = () => process.env.DISCORD_GENERAL_CHANNEL_ID || '';
export const assetLearnConfigured = () => !!(process.env.DISCORD_BOT_TOKEN && generalChannelId());

// Group key — spaceless lowercase alnum so model codes collapse ("17 g" / "17G" / "17g" → "17g") and the
// same machine doesn't split into two assets. The readable name is kept on `asset` for display.
export const assetKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const spaceless = assetKey;

// Cheap gate so Claude only sees plausibly-locational messages (not "lol" / "thanks"). Inclusive on purpose —
// the user asked for ANYTHING with a location (machines, tools, keys, materials).
const SIGNAL = /\b(pick(?:ed|ing)?\s*up|drop(?:ped|ping)?|ready|load(?:ed|ing)?|haul|trailer|on[-\s]?site|moved?|return(?:ed|ing)?|left\s+(?:it|the|at)|stage[ds]?|deliver(?:ed)?|park(?:ed)?|key|locker|storage|in\s+the\s+(?:shop|van|truck|yard|bay)|at\s+the\b)\b/i;
const ADDRESSY = /\b\d{1,6}\s+\w+|\b(st|street|ave|avenue|ct|court|rd|road|blvd|dr|drive|ln|lane|way|hwy|pkwy|pike|cir|circle)\b/i;
const looksLocational = (txt) => { const t = String(txt || ''); return t.length >= 4 && (SIGNAL.test(t) || ADDRESSY.test(t)); };

const SYSTEM = [
  'You read a plumbing + excavation crew\'s #general logistics chat and extract where their STUFF is.',
  'Pull out ANY asset whose LOCATION or CUSTODY a message reports: heavy equipment (excavator/"17G"/skid steer/trailer/jetter), tools (camera, locator, jetter), keys, or materials (copper, fittings, a pump).',
  'A message is often a REPLY — the asset may live in the quoted message and the location/action in the new one (e.g. quoted "17 g ready for pickup", reply "picked up and dropped at 426 E Broadway" → asset "17G", action "dropped", location "426 E Broadway").',
  'action ∈ ready_pickup | picked_up | dropped | has | returned | moved. Use the closest. location = the place/address exactly as written. holder = the person who has/took it if stated (or @mentioned), else null.',
  'Return ONLY JSON: {"items":[{"asset":"...","kind":"equipment|tool|key|material|other","action":"...","location":"...","holder":null}]}. If the message is banter / a reaction / has no asset+place, return {"items":[]}. Never invent a location that isn\'t there.',
].join('\n');

async function extractAssets(m) {
  if (!isAiConfigured('owner')) return [];
  const client = getAnthropic('owner');
  const ctx = m.reply ? `Quoted (replied-to) message from ${m.reply.author || 'someone'}: "${m.reply.content}"\n` : '';
  const user = `${ctx}Message from ${m.author}: "${m.content}"\n\nExtract the assets + locations. JSON only.`;
  try {
    const res = await client.messages.create({ model: AI_MODEL, max_tokens: 400, output_config: { effort: 'low' }, system: SYSTEM, messages: [{ role: 'user', content: user }] });
    const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    const parsed = JSON.parse(text.replace(/^```(json)?/i, '').replace(/```$/, '').trim());
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return items.filter((it) => it && String(it.asset || '').trim() && String(it.location || it.holder || '').trim());
  } catch (_) { return []; }
}

// Pull recent #general, skip already-processed messages, learn the rest. Returns a small summary.
export async function learnAssetLocations(sb, { limit = 30, windowMin = 90 } = {}) {
  if (!assetLearnConfigured()) return { ok: false, learned: 0, msg: 'Set DISCORD_BOT_TOKEN + DISCORD_GENERAL_CHANNEL_ID.' };
  const f = await fetchChannelMessages(generalChannelId(), limit);
  if (!f.ok) return { ok: false, learned: 0, msg: 'general: ' + f.error };
  const since = Date.now() - windowMin * 60000;
  const recent = f.messages.filter((m) => { const ts = Date.parse(m.at || ''); return Number.isFinite(ts) ? ts >= since : true; });
  if (!recent.length) return { ok: true, learned: 0, msg: 'Nothing recent in #general.' };

  // Skip messages we already turned into rows (a message can yield several rows → dedupe by provider_id).
  let seen = new Set();
  try {
    const ids = recent.map((m) => m.id);
    const { data } = await sb.from('asset_locations').select('provider_id').in('provider_id', ids);
    seen = new Set((data || []).map((r) => r.provider_id));
  } catch (e) {
    if (/asset_locations|does not exist|schema cache/i.test(String(e?.message || e))) return { ok: false, learned: 0, msg: 'Run supabase/145_asset_locations.sql first.' };
  }

  let learned = 0;
  for (const m of recent) {
    if (seen.has(m.id)) continue;
    if (!looksLocational(m.content) && !looksLocational(m.reply?.content)) continue; // cheap gate before any AI
    const items = await extractAssets(m);
    if (!items.length) continue;
    const rows = items.map((it) => ({
      asset: String(it.asset).slice(0, 80), asset_key: assetKey(it.asset).slice(0, 80),
      kind: ['equipment', 'tool', 'key', 'material', 'other'].includes(it.kind) ? it.kind : 'other',
      action: String(it.action || 'moved').slice(0, 20), location: it.location ? String(it.location).slice(0, 200) : null,
      holder: it.holder ? String(it.holder).slice(0, 80) : null, by_name: m.author, provider_id: m.id, created_at: m.at || new Date().toISOString(),
    }));
    try { const { error } = await sb.from('asset_locations').insert(rows); if (!error) learned += rows.length; } catch (_) {}
  }
  return { ok: true, learned, msg: learned ? `Learned ${learned} asset update${learned === 1 ? '' : 's'} from #general.` : 'Nothing new to learn.' };
}

// Recent sightings, de-duped by (asset_key + location) so DIFFERENT units/places of the same model ALL show
// (4 17Gs at 4 sites), while the same machine re-posted at the same place isn't repeated. Newest first.
export async function recentSightings(sb, { limit = 40 } = {}) {
  try {
    const { data } = await sb.from('asset_locations').select('asset, asset_key, kind, action, location, holder, by_name, created_at').order('created_at', { ascending: false }).limit(200);
    const seen = new Set(), out = [];
    for (const r of (data || [])) {
      const k = `${r.asset_key}|${spaceless(r.location || '')}`;
      if (seen.has(k)) continue; seen.add(k); out.push(r);
      if (out.length >= limit) break;
    }
    return out;
  } catch (_) { return []; }
}

// Owned-equipment roster — one row per physical machine (tag_code-ready). Best-effort; empty until mig 146 is run.
export async function fleetRoster(sb) {
  try { const { data } = await sb.from('equipment_fleet').select('model, model_key, unit_label, tag_code, kind').eq('active', true).order('unit_label'); return data || []; }
  catch (_) { return []; }
}

// Per-model picture: the UNITS we own vs the recent distinct locations posted — so Hank/My-Truck can say
// "2 of your 4 17Gs were posted recently — 426 E Broadway + 2501 Mansion View; 2 haven't come up." Matches a
// sighting to a model when their spaceless keys prefix-overlap ("17g" ⊃ "17g3" for a tagged/labeled unit).
export async function fleetSummary(sb) {
  const [units, sightings] = await Promise.all([fleetRoster(sb), recentSightings(sb, { limit: 80 })]);
  const byModel = new Map();
  for (const u of units) {
    const key = spaceless(u.model_key);
    if (!byModel.has(key)) byModel.set(key, { model: u.model, key, kind: u.kind, units: [] });
    byModel.get(key).units.push({ label: u.unit_label, tagged: !!u.tag_code });
  }
  return [...byModel.values()].map((m) => {
    const hits = sightings.filter((s) => { const sk = spaceless(s.asset_key); return sk === m.key || sk.startsWith(m.key) || m.key.startsWith(sk); });
    const locations = hits.map((h) => ({ location: h.location, holder: h.holder, by: h.by_name, when: h.created_at, said: h.asset }));
    return { model: m.model, count: m.units.length, kind: m.kind, units: m.units, tagged: m.units.filter((u) => u.tagged).length, seen: locations.length, locations: locations.slice(0, Math.max(m.units.length, 4)) };
  });
}

// All recent sightings matching "where's the <query>?" — can be several (a model with multiple units).
export async function findAssetLocation(sb, query, { max = 6 } = {}) {
  const q = String(query || '').trim(); if (!q) return [];
  const qk = spaceless(q);
  const all = await recentSightings(sb, { limit: 200 });
  return all.filter((r) => { const ak = spaceless(r.asset); return ak.includes(qk) || qk.includes(ak); }).slice(0, max);
}
