'use server';

import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { getAnthropic, isAiConfigured, AI_MODEL } from '@/lib/anthropic';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

// Hank — the Clog Busterz field brain. Ported from the iPad "Plumber's Brain" Q&A. Uses the
// asker's role Claude key; logs usage to ai_usage (so GM/Owner rollups count it).
export async function askHank(question, history) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Not signed in.' };
  const profile = await loadProfile(user);
  if (profile.active === false) return { ok: false, msg: 'Account deactivated.' };
  const role = profile.role;
  const q = String(question || '').trim();
  if (!q) return { ok: false, msg: 'Ask Hank something.' };
  if (!isAiConfigured(role)) return { ok: false, msg: 'No Claude key for your role yet — add an ANTHROPIC_KEY_* in Vercel.' };

  // carry a little context (last few turns) so follow-ups make sense
  const msgs = [];
  (Array.isArray(history) ? history.slice(-6) : []).forEach((h) => { if (h && h.q && h.a) { msgs.push({ role: 'user', content: String(h.q).slice(0, 800) }); msgs.push({ role: 'assistant', content: String(h.a).slice(0, 1500) }); } });
  msgs.push({ role: 'user', content: q });

  const anthropic = getAnthropic(role);
  let res;
  try {
    res = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      output_config: { effort: 'low' },
      system:
        'You are Hank, the Clog Busterz Plumbing field brain — a veteran master plumber helping a CB tech in the field in Kentucky. Answer plainly and practically for someone standing at the job: clear diagnosis steps and what to check, in order. Cover water heaters (gas vs electric, venting/draft, T&P, anode, sizing, thermocouple/igniter), drains & sewer, fixtures, gas, backflow, and manufacturer specs. Reference Kentucky plumbing code / IPC only when you are sure — never invent a code citation; if unsure, say exactly what to verify and with whom. Flag anything that is a permit or safety issue (gas, sewer depth, backflow, venting). Keep it tight and step-by-step; a tech is reading this one-handed.',
      messages: msgs,
    });
  } catch (e) { return { ok: false, msg: 'AI error: ' + ((e && e.message) || String(e)) }; }

  const answer = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  try { const sb = getSupabaseAdmin(); if (sb) await sb.from('ai_usage').insert({ role, screen: 'hank', model: AI_MODEL, input_tokens: res.usage?.input_tokens || 0, output_tokens: res.usage?.output_tokens || 0, user_email: user.email || '' }); } catch (_) {}
  return { ok: true, answer: answer || '(no answer)' };
}
