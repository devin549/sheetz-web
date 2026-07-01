'use server';

import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { getAnthropic, isAiConfigured, AI_MODEL } from '@/lib/anthropic';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

// 💵 Hank's NUMBERS context — the tech's last 30 days pulled LIVE off the web jobs (revenue, material,
// receipts by vendor + store-run counts). This is what makes "what's my most profitable job?" and "how much
// did the Lowe's runs cost me?" answerable — including what buying from the CB SHOP would have saved.
// Best-effort: any query hiccup → '' and Hank still answers plumbing questions.
async function techNumbersContext(profile, userEmail) {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return '';
    const email = String(userEmail || profile.email || '').trim().toLowerCase();
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    let jq = sb.from('jobs').select('id, job_number, job_type, amount, material_cost_cents, dispatch_fee_cents, status, completed_at, scheduled_at').gte('scheduled_at', since).order('scheduled_at', { ascending: false }).limit(40);
    if (profile.tech_id) jq = jq.eq('tech_id', profile.tech_id);
    else if (email) jq = jq.eq('tech_email', email);
    else return '';
    const { data: jobs } = await jq;
    if (!jobs?.length) return '';
    const ids = jobs.map((j) => j.id);
    let entries = [];
    try { const { data } = await sb.from('receipt_entries').select('job_id, vendor, amount_cents, is_subcontractor').in('job_id', ids.slice(0, 40)); entries = data || []; } catch (_) {}
    const byJobRuns = {};
    const byVendor = {};
    entries.forEach((e) => {
      if (e.is_subcontractor) return;
      (byJobRuns[e.job_id] = byJobRuns[e.job_id] || { n: 0, cents: 0 }); byJobRuns[e.job_id].n++; byJobRuns[e.job_id].cents += Number(e.amount_cents) || 0;
      const v = (e.vendor || 'Store').trim() || 'Store'; (byVendor[v] = byVendor[v] || { n: 0, cents: 0 }); byVendor[v].n++; byVendor[v].cents += Number(e.amount_cents) || 0;
    });
    const $ = (c) => '$' + ((Number(c) || 0) / 100).toFixed(0);
    const lines = jobs.filter((j) => Number(j.amount) > 0 || byJobRuns[j.id]).slice(0, 25).map((j) => {
      const rev = Number(j.amount) || 0, mat = (Number(j.material_cost_cents) || 0) / 100;
      const runs = byJobRuns[j.id];
      const marginPct = rev > 0 ? Math.round(((rev - mat) / rev) * 100) : null;
      return `#${j.job_number || '—'} ${String(j.job_type || 'service').slice(0, 26)} · rev $${rev.toFixed(0)} · material $${mat.toFixed(0)}${marginPct != null ? ` · ~${marginPct}% margin-after-material` : ''}${runs ? ` · ${runs.n} store run${runs.n > 1 ? 's' : ''} ${$(runs.cents)}` : ''}${/done|complete|closed/.test(String(j.status || '')) ? '' : ` · ${j.status || 'open'}`}`;
    });
    const vendors = Object.entries(byVendor).sort((a, b) => b[1].cents - a[1].cents).map(([v, s]) => `${v} ×${s.n} runs ${$(s.cents)}`).join(' · ');
    return `\n\nTECH'S LIVE NUMBERS — last 30 days (from the CB jobs system, this tech only):\n${lines.join('\n')}${vendors ? `\nStore receipts by vendor: ${vendors}` : ''}\n\nMONEY RULES for your answers:\n- Material cost drives the markup tier (2× when ≤$399 · 1.5× when >$399) and eats the tech's margin — cheaper material = more pay.\n- THE SHOP RULE: CB's shop sells stock at cost+5%. Big-box retail (Lowe's/Home Depot) typically runs ~15% over shop price, and every store run costs ~30 min of drive/windshield time. When you see many store runs, estimate what buying from the CB shop (or loading the van fuller) would have saved — dollars AND time — and say it plainly.\n- Use ONLY these numbers for money answers; if something isn't in the data, say you don't see it rather than guessing.`;
  } catch (_) { return ''; }
}

// Hank — the Clog Busterz field brain. Ported from the iPad "Plumber's Brain" Q&A. Uses the
// asker's role Claude key; logs usage to ai_usage (so GM/Owner rollups count it). Now numbers-aware:
// a field tech's Hank also reads their live 30-day job + receipt numbers (the iPad "Hank knows your
// numbers" promise, wired to the WEB data instead of the old Tech Sheet).
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

  // Money questions need the tech's live numbers — pulled per ask so they're never stale.
  const numbersCtx = await techNumbersContext(profile, user.email);

  const anthropic = getAnthropic(role);
  let res;
  try {
    res = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      output_config: { effort: 'low' },
      system:
        'You are Hank, the Clog Busterz Plumbing field brain — a veteran master plumber helping a CB tech in the field in Kentucky. Answer plainly and practically for someone standing at the job: clear diagnosis steps and what to check, in order. Cover water heaters (gas vs electric, venting/draft, T&P, anode, sizing, thermocouple/igniter), drains & sewer, fixtures, gas, backflow, and manufacturer specs. Reference Kentucky plumbing code / IPC only when you are sure — never invent a code citation; if unsure, say exactly what to verify and with whom. Flag anything that is a permit or safety issue (gas, sewer depth, backflow, venting). Keep it tight and step-by-step; a tech is reading this one-handed. You ALSO know this tech’s live money numbers (below, when present) — most profitable job, margin killers, store-run waste, what the shop would have saved. Answer money questions from that data in the same plain voice.'
        + numbersCtx,
      messages: msgs,
    });
  } catch (e) { return { ok: false, msg: 'AI error: ' + ((e && e.message) || String(e)) }; }

  const answer = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  try { const sb = getSupabaseAdmin(); if (sb) await sb.from('ai_usage').insert({ role, screen: 'hank', model: AI_MODEL, input_tokens: res.usage?.input_tokens || 0, output_tokens: res.usage?.output_tokens || 0, user_email: user.email || '' }); } catch (_) {}
  return { ok: true, answer: answer || '(no answer)' };
}
