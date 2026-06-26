'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { canAny } from '@/lib/roles';
import { getAnthropic, isAiConfigured, AI_MODEL } from '@/lib/anthropic';

const clean = (v, n = 4000) => String(v == null ? '' : v).trim().slice(0, n);
const missing = (e) => /relation|column|schema cache|does not exist/i.test(e?.message || '');
const isMkt = (r) => canAny(r, ['seeReports', 'manageUsers', 'seeFinancials']);

async function ctx() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!isMkt(profile.role)) return { err: 'Marketing / owner only.' };
  return { user, profile, sb: getSupabaseAdmin() };
}

// The towns/keywords where we're weak or invisible — the content targets.
async function gatherGaps(sb) {
  try {
    const { data } = await sb.from('rank_checks').select('keyword, location, position, found, checked_at').order('checked_at', { ascending: false }).limit(2000);
    const latest = {}; (data || []).forEach((r) => { const k = r.keyword + '|' + r.location; if (!latest[k]) latest[k] = r; });
    const gaps = Object.values(latest).filter((r) => !r.found || (r.position && r.position > 5)).map((r) => ({ keyword: r.keyword, town: r.location.split(',')[0], status: r.found ? `#${r.position}` : 'not found' }));
    return gaps.slice(0, 40);
  } catch { return []; }
}

// 🤖 Recommend blog posts that attack the gaps (Claude). Inserts them as ideas.
export async function generateIdeas() {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  if (!isAiConfigured(c.profile.role)) return { ok: false, msg: 'Add ANTHROPIC_KEY_* in Vercel to generate content.' };
  const gaps = await gatherGaps(c.sb);
  const gapText = gaps.length ? gaps.map((g) => `- "${g.keyword}" in ${g.town} (${g.status})`).join('\n') : '- (no rank data yet — use common central-KY plumbing topics for Lexington, Nicholasville, Winchester)';

  let res;
  try {
    res = await getAnthropic(c.profile.role).messages.create({
      model: AI_MODEL, max_tokens: 1500,
      system: 'You are a local-SEO strategist for Clog Busterz Plumbing in central Kentucky (Richmond HQ; growing toward Lexington, Nicholasville, Berea, Winchester, Mount Vernon). Recommend blog posts that win local searches. Reply with ONLY a compact JSON array, max 8 items: [{"title": string, "target_keyword": string, "target_town": string, "rationale": string (one line, the gap it attacks)}]. Titles must be specific and locally optimized (include the town + service).',
      messages: [{ role: 'user', content: `We don't rank well for these keyword × town combos:\n${gapText}\n\nRecommend up to 8 blog posts to grow into them. Prioritize the most winnable gaps and our biggest services (drain, water heater, sewer, hydro jetting).` }],
    });
  } catch (e) { return { ok: false, msg: 'AI error: ' + (e?.message || e) }; }

  const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').replace(/```json|```/g, '').trim();
  let ideas; try { ideas = JSON.parse(text); } catch { return { ok: false, msg: 'Could not parse the AI suggestions — try again.' }; }
  const rows = (Array.isArray(ideas) ? ideas : []).slice(0, 8).map((i) => ({ title: clean(i.title, 200), target_keyword: clean(i.target_keyword, 120) || null, target_town: clean(i.target_town, 80) || null, rationale: clean(i.rationale, 400) || null, created_by: c.user.id, created_by_name: c.profile.name || c.user.email })).filter((r) => r.title);
  if (!rows.length) return { ok: false, msg: 'No ideas came back.' };

  const { error } = await c.sb.from('content_ideas').upsert(rows, { onConflict: 'title', ignoreDuplicates: true });
  if (error) {
    if (/no unique|on conflict/i.test(error.message || '')) { for (const r of rows) { try { await c.sb.from('content_ideas').insert(r); } catch (_) {} } }
    else return { ok: false, msg: missing(error) ? 'Run supabase/110_content_ideas.sql first.' : error.message };
  }
  try { await c.sb.from('ai_usage').insert({ role: c.profile.role, screen: 'content', model: AI_MODEL, input_tokens: res.usage?.input_tokens || 0, output_tokens: res.usage?.output_tokens || 0, user_email: c.user.email || '' }); } catch (_) {}
  revalidatePath('/content');
  return { ok: true, msg: `${rows.length} blog ideas added.` };
}

// ✍️ Draft the full post for an idea (Claude → markdown).
export async function draftIdea(id) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  if (!isAiConfigured(c.profile.role)) return { ok: false, msg: 'Add ANTHROPIC_KEY_* in Vercel.' };
  const { data: idea } = await c.sb.from('content_ideas').select('*').eq('id', id).maybeSingle();
  if (!idea) return { ok: false, msg: 'Idea not found.' };

  let res;
  try {
    res = await getAnthropic(c.profile.role).messages.create({
      model: AI_MODEL, max_tokens: 2000,
      system: 'You write helpful, trustworthy local-SEO blog posts for Clog Busterz Plumbing, a family plumbing company in central Kentucky. Phone (859) 408-3382. Natural, expert, not spammy. Markdown: an H1 title, a short intro, 3-4 H2 sections, a brief FAQ (3 Qs), and a closing CTA to call or book online. ~600-800 words. Weave in the target town + keyword naturally.',
      messages: [{ role: 'user', content: `Write the post.\nTitle: ${idea.title}\nTarget keyword: ${idea.target_keyword || ''}\nTown: ${idea.target_town || ''}` }],
    });
  } catch (e) { return { ok: false, msg: 'AI error: ' + (e?.message || e) }; }
  const draft = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  if (!draft) return { ok: false, msg: 'No draft came back.' };
  await c.sb.from('content_ideas').update({ draft, status: 'drafted' }).eq('id', id);
  try { await c.sb.from('ai_usage').insert({ role: c.profile.role, screen: 'content', model: AI_MODEL, input_tokens: res.usage?.input_tokens || 0, output_tokens: res.usage?.output_tokens || 0, user_email: c.user.email || '' }); } catch (_) {}
  revalidatePath('/content');
  return { ok: true, msg: 'Drafted.', draft };
}

// ✏️ Save your edits to a draft (you can rewrite anything the AI wrote before publishing).
export async function saveDraft(id, draft) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const body = clean(draft, 20000);
  const { error } = await c.sb.from('content_ideas').update({ draft: body, status: 'drafted' }).eq('id', id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/content');
  return { ok: true, msg: 'Saved.' };
}

export async function setIdeaStatus(id, status, url) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  if (!['idea', 'drafted', 'published', 'dismissed'].includes(status)) return { ok: false, msg: 'Bad status.' };
  const patch = { status }; const u = clean(url, 400); if (u) patch.published_url = u;
  const { error } = await c.sb.from('content_ideas').update(patch).eq('id', id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/content');
  return { ok: true, msg: `Marked ${status}.` };
}
