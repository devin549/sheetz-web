// Hank — CB's plumber-savvy AI teammate inside the #sheetz chat. He READS the feed (synced from
// Discord) and chimes in ONLY when he can materially help, grounded in real CB data. Silent otherwise.
// Server-only. Reuses the per-role Claude keys + webhook poster.
import { getAnthropic, isAiConfigured, AI_MODEL } from '@/lib/anthropic';
import { postToDiscord } from '@/lib/discord';
import { syncDiscordCore } from '@/lib/discordSync';
import { FIELD_POSITIONS, positionLabel } from '@/lib/positions';
import { SHOPS, shopLabel, shopAddress, mapsDir } from '@/lib/shops';

// Hands-on helpers for a 2-man job. Management (supervisor/GM/owner) run calls but are backup, not primary.
const PRIMARY_HELPER_POS = ['tech', 'helper', 'salesman'];

const HANK_ROLE = 'owner'; // Hank runs on the owner key (rolls up usage to Owner/GM).
const HANK_NAME = 'Pipe Wrench Hank'; // how he signs his posts in #sheetz + the feed.

// A compact, live snapshot for Hank to reason over. Everything is best-effort + table-missing safe.
export async function hankContext(sb) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  const pick = (r, keys) => { const o = {}; keys.forEach((k) => { if (r[k] != null && r[k] !== '') o[k] = r[k]; }); return o; };

  let roster = [];
  try {
    const { data } = await sb.from('techs').select('*').limit(300);
    roster = (data || []).map((t) => ({ name: t.name || t.full_name || '', position: String(t.position || t.role || '').toLowerCase().replace(/\s+/g, '_'), active: t.active !== false }))
      .filter((t) => t.name);
  } catch (_) {}
  // FIELD crew only: active AND an explicit field position (excludes dispatcher/office/accounting/shop AND
  // terminated). Untagged people are NOT counted — never claim someone's an available helper if their role
  // is unknown. Keep the roster accurate in /team for this to be right.
  const fieldCrew = roster.filter((t) => t.active && FIELD_POSITIONS.includes(t.position));

  let jobsToday = [], openCount = 0, busyTechs = new Set();
  const techNow = {}; // techNameLower -> { at, directions } = where each tech physically is right now
  try {
    const { data } = await sb.from('jobs').select('*').gte('scheduled_at', todayISO).limit(300);
    (data || []).forEach((j) => {
      const status = String(j.status || '').toLowerCase();
      const active = /scheduled|enroute|on_site|on site|dispatched/.test(status);
      const addr = j.address || j.street || '', city = j.city || j.address_city || '';
      if (active && j.tech_name) {
        openCount++;
        const key = String(j.tech_name).toLowerCase();
        busyTechs.add(key);
        const dest = addr || city;
        if (dest && !techNow[key]) techNow[key] = { at: [addr, city].filter(Boolean).join(', '), directions: mapsDir(dest) };
      } else if (active) openCount++;
      jobsToday.push({ customer: j.customer_name || '', city, type: j.job_type || '', status: j.status || '', tech: j.tech_name || '', addr });
    });
  } catch (_) {}
  jobsToday = jobsToday.slice(0, 40);
  const whereIs = (name) => (name ? techNow[String(name).toLowerCase()] : null) || null;

  // Availability: field crew NOT on an active job right now, tagged with role + whether they're a primary helper.
  const likelyAvailable = fieldCrew
    .filter((t) => !busyTechs.has(t.name.toLowerCase()))
    .map((t) => ({ name: t.name, role: positionLabel(t.position), primaryHelper: PRIMARY_HELPER_POS.includes(t.position) }));

  let shopStock = [];
  try {
    const { data } = await sb.from('shop_stock').select('*').limit(150);
    shopStock = (data || []).map((s) => pick(s, ['sku', 'name', 'location', 'qty', 'on_hand'])).filter((s) => Object.keys(s).length);
  } catch (_) {}

  // Tool registry — who holds each company tool + WHERE they are now (or which shop) + a Maps link.
  let tools = [];
  const mapTool = (t) => {
    const holder = t.assigned_to || null;
    const loc = holder ? whereIs(holder) : null;
    const sAddr = !holder && t.shop_location ? shopAddress(t.shop_location) : '';
    return {
      tool: t.name, serial: t.serial || undefined, status: t.status || '',
      heldBy: holder,                                            // null = in the shop, not signed out
      atShop: !holder && t.shop_location ? shopLabel(t.shop_location) : undefined,
      holderLocation: loc ? loc.at : undefined,                  // where that tech is working right now
      directions: loc ? loc.directions : (sAddr ? mapsDir(sAddr) : undefined),
    };
  };
  try {
    const { data } = await sb.from('tools').select('name, serial, assigned_to, status, shop_location').limit(300);
    tools = (data || []).filter((t) => t.name).map(mapTool);
  } catch (_) {
    try { const { data } = await sb.from('tools').select('name, serial, assigned_to, status').limit(300); tools = (data || []).filter((t) => t.name).map(mapTool); } catch (__) {}
  }

  // Van stock — what MATERIAL each tech carries, so Hank can route someone to the nearest one + directions.
  let vanStock = {};
  try {
    const fieldNames = new Set(fieldCrew.map((t) => t.name.toLowerCase()));
    const { data } = await sb.from('truck_inventory').select('tech_name, name, qty').gt('qty', 0).limit(900);
    (data || []).forEach((r) => { if (!r.tech_name || !r.name) return; if (fieldNames.size && !fieldNames.has(String(r.tech_name).toLowerCase())) return; (vanStock[r.tech_name] = vanStock[r.tech_name] || new Set()).add(r.name); });
    vanStock = Object.fromEntries(Object.entries(vanStock).map(([k, v]) => [k, [...v].slice(0, 40)]));
  } catch (_) {}

  // Where each field tech is right now (for "send a link to the closest tech for material/equipment").
  const crewLocations = fieldCrew.map((t) => { const l = whereIs(t.name); return l ? { name: t.name, at: l.at, directions: l.directions } : null; }).filter(Boolean);

  return {
    fieldCrew: fieldCrew.map((t) => `${t.name} (${positionLabel(t.position)})`),
    likelyAvailable,
    availabilityNote: 'likelyAvailable = active FIELD crew not on a job right now. Office staff (dispatchers, GM-as-office, accounting) and terminated people are already excluded. When asked "are helpers available", lead with primaryHelper:true (techs/helpers/salesmen); mention supervisors/GM/owner only as backup since they run calls but aren\'t primary helpers. If the list is empty, say nobody\'s free — do not pull in office or untagged people.',
    jobsToday: { openActive: openCount, sample: jobsToday },
    shopStock: shopStock.length ? shopStock : undefined,
    tools: tools.length ? tools : undefined,
    vanStock: Object.keys(vanStock).length ? vanStock : undefined,
    crewLocations: crewLocations.length ? crewLocations : undefined,
    shops: SHOPS.map((s) => ({ shop: s.label, address: s.address || undefined, directions: s.address ? mapsDir(s.address) : undefined })),
    locateNote: 'For "who has the camera/auger?" use tools[] (heldBy / atShop). For "who has <material/part>?" use vanStock (tech → items they carry). When you name a tech who has something, INCLUDE their holderLocation/at and the directions link VERBATIM so a teammate can drive there — that is the "send a link to the closest tech" ask. directions is where the tech is working right now (their current job), not their home. You do NOT have live GPS, so don’t rank true distance — name who has it + where they are + the link, and let the human pick. For a shop-held tool, name the shop (Richmond/Lexington) + its directions link if present. If a tool/material isn’t in the data, stay silent. NEVER invent a Maps URL — only use the directions links provided.',
  };
}

const SYSTEM = [
  'You are Pipe Wrench Hank, a plumber-savvy teammate in Clog Busterz\' internal #sheetz team chat (plumbing company, Richmond + Lexington KY).',
  'You help the crew using ONLY the JSON business data provided. You are a real teammate, not a bot — brief, warm, plumber-plain.',
  'HARD RULES:',
  '1. Speak ONLY when you can materially help: answer a real question, locate something in the data, or surface a useful job/crew/stock fact. ',
  '2. If a message is banter, a reaction, a joke, small talk, or you do NOT have the data to answer confidently — STAY SILENT for it (omit it).',
  '3. NEVER guess or invent. If the answer is not in the data, stay silent. Do not say "I don\'t know" — just skip it.',
  '4. Keep replies to ONE or TWO short sentences. No preamble, no restating the question. Friendly, direct.',
  '5. You CAN say who holds a tool from the tools[] registry (heldBy = the tech who signed it out; null = in the shop). But you do NOT know which physical shop (Richmond vs Lexington) — don’t claim one. If a tool isn’t in tools[], stay silent.',
  'Return ONLY valid JSON: {"replies":[{"id":"<messageId>","reply":"<your help>"}]}. Include ONLY messages you are genuinely helping with; omit all others. If you can help with none, return {"replies":[]}.',
].join('\n');

// Ask Claude which (if any) of these new messages Hank should help with, and how.
export async function hankBrain(messages, ctx) {
  if (!isAiConfigured(HANK_ROLE)) return { replies: [], err: 'No Claude key (ANTHROPIC_KEY_OWNER).' };
  const anthropic = getAnthropic(HANK_ROLE);
  const payload = {
    data: ctx,
    newMessages: messages.map((m) => ({ id: m.id, from: m.author, text: m.text })),
  };
  let res;
  try {
    res = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 900,
      output_config: { effort: 'low' },
      system: SYSTEM,
      messages: [{ role: 'user', content: `Business data + the newest #sheetz messages:\n${JSON.stringify(payload)}\n\nWhich, if any, should Hank help with? Reply with the JSON only.` }],
    });
  } catch (e) { return { replies: [], err: String((e && e.message) || e).slice(0, 160) }; }
  const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  let parsed = { replies: [] };
  try { parsed = JSON.parse(text.replace(/^```(json)?/i, '').replace(/```$/, '').trim()); } catch (_) {}
  const replies = Array.isArray(parsed.replies) ? parsed.replies.filter((r) => r && r.id && String(r.reply || '').trim()) : [];
  return { replies, usage: res.usage };
}

// Full cycle: sync the feed, look at what Hank hasn't seen, let him help, post + log + mark seen.
// autoPost=false → Hank only marks seen + returns drafts (used when HANK_AUTOREPLY is off).
export async function runHank(sb, { autoPost = true, limit = 12 } = {}) {
  await syncDiscordCore(sb); // make sure the latest #sheetz chatter is in the feed
  let unseen = [];
  try {
    const { data } = await sb.from('cb_comms').select('id, provider_id, from_name, body, created_at')
      .eq('channel', 'discord').eq('direction', 'in').is('hank_seen_at', null)
      .order('created_at', { ascending: false }).limit(limit);
    unseen = data || [];
  } catch (e) { return { ok: false, msg: 'Need migration 57 (hank_seen_at): ' + String((e && e.message) || e).slice(0, 120) }; }
  if (!unseen.length) return { ok: true, considered: 0, posted: 0, msg: 'Nothing new for Hank.' };

  const ctx = await hankContext(sb);
  const items = unseen.map((u) => ({ id: u.provider_id || u.id, author: u.from_name || 'crew', text: u.body || '' }));
  const { replies, err } = await hankBrain(items, ctx);

  // Mark every considered message seen so Hank never reconsiders them (even the ones he skipped).
  const seenAt = new Date().toISOString();
  try { await sb.from('cb_comms').update({ hank_seen_at: seenAt }).in('id', unseen.map((u) => u.id)); } catch (_) {}

  if (err) return { ok: false, considered: unseen.length, posted: 0, msg: 'Hank: ' + err };
  if (!replies.length) return { ok: true, considered: unseen.length, posted: 0, msg: `Hank read ${unseen.length}, nothing to add.` };

  let posted = 0;
  for (const r of replies) {
    if (autoPost) {
      const out = await postToDiscord(`🔧 ${HANK_NAME}: ${r.reply}`);
      try { await sb.from('cb_comms').insert({ channel: 'discord', direction: 'out', to_addr: '#sheetz', from_name: HANK_NAME, body: r.reply, status: out.ok ? 'sent' : 'failed', error: out.ok ? null : out.error, reply_to: r.id, sent_by: HANK_NAME }); } catch (_) {}
      if (out.ok) posted++;
    }
  }
  return { ok: true, considered: unseen.length, posted, drafts: autoPost ? undefined : replies, msg: autoPost ? `Hank helped on ${posted} of ${unseen.length}.` : `Hank drafted ${replies.length} (auto-reply off).` };
}

// One-off "Ask Hank" — a person asks directly; always answers (manual), optionally posts to #sheetz.
export async function askHankCore(sb, question, { post = false } = {}) {
  if (!isAiConfigured(HANK_ROLE)) return { ok: false, msg: 'No Claude key (ANTHROPIC_KEY_OWNER) in Vercel.' };
  const ctx = await hankContext(sb);
  // recent feed for conversational context
  let recent = [];
  try { const { data } = await sb.from('cb_comms').select('from_name, body, direction').eq('channel', 'discord').order('created_at', { ascending: false }).limit(12); recent = (data || []).reverse().map((m) => `${m.from_name || (m.direction === 'in' ? 'crew' : 'office')}: ${m.body}`); } catch (_) {}
  const anthropic = getAnthropic(HANK_ROLE);
  let res;
  try {
    res = await anthropic.messages.create({
      model: AI_MODEL, max_tokens: 600, output_config: { effort: 'low' },
      system: 'You are Pipe Wrench Hank, Clog Busterz\' plumber-savvy team assistant. Answer the question directly and briefly (1-3 sentences) using ONLY the JSON data + recent chat provided. Plain, friendly, plumber voice. If the data does not contain it, say briefly what you\'d need — do not guess.',
      messages: [{ role: 'user', content: `Data:\n${JSON.stringify(ctx)}\n\nRecent #sheetz chat:\n${recent.join('\n')}\n\nQuestion: ${String(question || '').trim()}` }],
    });
  } catch (e) { return { ok: false, msg: 'AI error: ' + String((e && e.message) || e).slice(0, 140) }; }
  const answer = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim() || '(no answer)';
  if (post) {
    const out = await postToDiscord(`🔧 ${HANK_NAME}: ${answer}`);
    try { await sb.from('cb_comms').insert({ channel: 'discord', direction: 'out', to_addr: '#sheetz', from_name: HANK_NAME, body: answer, status: out.ok ? 'sent' : 'failed', error: out.ok ? null : out.error, sent_by: HANK_NAME }); } catch (_) {}
  }
  return { ok: true, answer, posted: !!post };
}
