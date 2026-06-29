'use server';

// Phase 2b-ii — The Always-Learning Loop (tech side).
//
// A tech does an odd job NOT in the catalog. They type a CUSTOM ENTRY (name + what they did + a one-off
// PRICE for THIS job + optional materials). Two server actions live here:
//   1. coachCustomEntry(rawName, rawDescription) — Claude (owner key) looks at the entry. If it's vague
//      ("rebuild toilet") it returns clarifying QUESTIONS + a polished, customer-grade rewrite. SUGGEST-ONLY:
//      the tech reviews and chooses to accept the rewrite. NEVER auto-applies, NEVER touches price.
//   2. recordCustomEntry({ jobId, name, description, price, materials, cleanedName, cleanedDescription,
//      suggestedCategory }) — persists the entry to pricebook_custom_entries so the catalog can LEARN. This
//      does NOT create or change any catalog item/price — the line sells ad-hoc on the estimate.
//
// HOUSE RULES (HARD):
//   • The custom-line `price` is the tech's ONE-OFF job quote (normal field work) — NOT a catalog price.
//     Nothing here writes a catalog price. (Owner prices the catalog item only IF later promoted — admin side.)
//   • AI suggests, human approves: the coach never auto-applies; the tech opts the rewrite in.
//   • Graceful degrade: no owner Anthropic key → a clear message (mirrors askHank / marketReference). The
//     record degrades softly if migration 126 isn't applied yet — it never blocks adding the cart line.
//   • Gated to the tech/booker — the SAME actionable-perm gate the estimate actions use (NOT read-only).

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { scopeJob } from './scope';
import { getAnthropic, isAiConfigured, AI_MODEL } from '@/lib/anthropic';
import { parseCoachResponse } from '@/lib/pricebookEngine';

const clean = (v, n = 600) => String(v == null ? '' : v).trim().slice(0, n);
const num = (v) => Math.max(0, Number(v) || 0);
const missing = (e) => /relation|column|schema cache|does not exist/i.test((e && e.message) || '');
const COACH_ROLE = 'owner'; // pricebook AI runs on the owner key (rolls usage up to Owner/GM), like Hank.

// Same actionable-perm gate the estimate/sale actions use — the tech, booker, dispatcher, office can act.
async function ctx() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: 'Sign in required.' };
  const profile = await loadProfile(user);
  // Actionable perm only — a read-only Viewer (seeAllJobs) must NOT spend the AI key or write entries.
  if (!(can(profile.role, 'changeStatus') || can(profile.role, 'collectPayment') || can(profile.role, 'createJobs')))
    return { err: 'Not allowed.' };
  return { user, profile, sb: getSupabaseAdmin() };
}

async function logAiUsage(c, screen, res) {
  try {
    await c.sb.from('ai_usage').insert({
      role: c.profile.role, screen, model: AI_MODEL,
      input_tokens: res?.usage?.input_tokens || 0, output_tokens: res?.usage?.output_tokens || 0,
      user_email: c.user.email || '',
    });
  } catch (_) {}
}

const aiText = (res) => (res?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();

// ── 1. AI description coach (suggest-only) ───────────────────────────────────────────────────────────
const COACH_SYSTEM = [
  "You are a pricebook coach for Clog Busterz, a plumbing company in Richmond + Lexington KY.",
  "A field tech just typed a CUSTOM line for a job that isn't in the catalog — often terse (\"rebuild toilet\").",
  "Your job: (a) decide if the entry is too VAGUE to stand as a clear, customer-grade line, (b) if so, ask the",
  "tech 1-4 short clarifying questions, and (c) draft a polished rewrite a homeowner would read on the estimate.",
  "CB voice: plumber-plain, warm, OUTCOME-first — what the work fixes/protects, not jargon or specs.",
  "HARD RULES:",
  "1. NEVER mention or invent a price, cost, margin, our material cost, vendors, or SKUs. Pricing is not your job.",
  "2. NO hype, NO fake urgency, NO invented warranties — only outcomes that plainly follow from the described work.",
  "3. Questions target the gaps that matter for a clear scope (e.g. which fixture/brand, what the job covered —",
  "   flapper, fill valve, wax ring, supply line — one-trip vs return). Keep each question one short sentence.",
  "4. cleanedName: a short, clear, benefit-leaning name (<= 60 chars), title case, no SKU.",
  "5. cleanedDescription: 1-3 short sentences, outcome-first, plain English. If the entry is too thin to write",
  "   responsibly, still draft your BEST guess but set needsDetail true and lead the questions.",
  "6. suggestedCategory: one short plumbing category guess for the catalog (e.g. \"Toilets\", \"Drains\", \"Water Heaters\").",
  'Return ONLY valid JSON: {"needsDetail":bool,"questions":["…"],"cleanedName":"…","cleanedDescription":"…","suggestedCategory":"…"}. No preamble.',
].join('\n');

export async function coachCustomEntry(rawName, rawDescription) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const name = clean(rawName, 160);
  const desc = clean(rawDescription, 600);
  if (!name && !desc) return { ok: false, msg: 'Type a name or a short description first.' };
  if (!isAiConfigured(COACH_ROLE)) return { ok: false, msg: 'Add ANTHROPIC_KEY_OWNER in Vercel to use the description coach.' };

  const anthropic = getAnthropic(COACH_ROLE);
  let res;
  try {
    res = await anthropic.messages.create({
      model: AI_MODEL, max_tokens: 500, output_config: { effort: 'low' },
      system: COACH_SYSTEM,
      messages: [{ role: 'user', content: `Tech's custom entry:\nName: ${name || '(none)'}\nWhat they did: ${desc || '(none)'}\n\nCoach it. JSON only.` }],
    });
  } catch (e) { return { ok: false, msg: 'AI error: ' + String((e && e.message) || e).slice(0, 140) }; }
  await logAiUsage(c, 'pricebook-custom-coach', res);

  const parsed = parseCoachResponse(aiText(res));
  if (!parsed.cleanedName && !parsed.cleanedDescription && !parsed.questions.length) {
    return { ok: false, msg: 'The coach returned nothing usable — try again or add a bit more detail.' };
  }
  // SUGGESTION ONLY — the tech reviews + chooses to accept the rewrite. Never auto-applied, never priced.
  return { ok: true, draft: true, coaching: parsed };
}

// ── 2. Record the custom entry (the learning signal) ─────────────────────────────────────────────────
// Persists to pricebook_custom_entries. `price` is the tech's per-job quote — NOT a catalog price. Returns
// { ok, recorded } — recorded:false (with a soft note) when migration 126 isn't applied, so the caller can
// still add the ad-hoc cart line without breaking.
export async function recordCustomEntry(payload = {}) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err, recorded: false };
  if (payload.jobId) { const s = await scopeJob(c, payload.jobId); if (s.err) return { ok: false, msg: s.err, recorded: false }; }
  const name = clean(payload.name, 160);
  if (!name) return { ok: false, msg: 'A name is required.', recorded: false };

  const row = {
    job_id: payload.jobId || null,
    tech_id: c.user.id,
    tech_name: c.profile.name || c.user.email || null,
    raw_name: name,
    raw_description: clean(payload.description, 600) || null,
    cleaned_name: clean(payload.cleanedName, 120) || null,
    cleaned_description: clean(payload.cleanedDescription, 600) || null,
    materials: clean(payload.materials, 400) || null,
    suggested_category: clean(payload.suggestedCategory, 80) || null,
    price: num(payload.price), // the tech's ONE-OFF quote for THIS job — never a catalog price
    status: 'new',
  };

  try {
    const { error } = await c.sb.from('pricebook_custom_entries').insert(row);
    if (error) {
      // Degrade softly on a missing migration — the cart line still goes through.
      if (missing(error)) return { ok: true, recorded: false, msg: 'Added (learning paused — run supabase/126_pricebook_custom_entries.sql to record custom jobs).' };
      return { ok: false, msg: error.message, recorded: false };
    }
  } catch (e) {
    if (missing(e)) return { ok: true, recorded: false, msg: 'Added (learning paused — run supabase/126_pricebook_custom_entries.sql to record custom jobs).' };
    return { ok: false, msg: String((e && e.message) || e), recorded: false };
  }

  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: c.profile.name || c.user.email, role: c.profile.role, action: 'pricebook.custom_entry', entity: 'pricebook_custom_entry', entity_id: payload.jobId || '', detail: { name, price: row.price } }); } catch (_) {}
  return { ok: true, recorded: true, msg: 'Custom line added and recorded for the catalog to learn from.' };
}
