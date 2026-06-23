'use server';

import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { roleOf } from '@/lib/nav';
import { can } from '@/lib/roles';
import { getAnthropic, isAiConfigured, keyForRole, AI_MODEL } from '@/lib/anthropic';

// Gather a compact, live snapshot of the business for the model to reason over.
async function boardContext(sb) {
  const [custCount, jobRows, invRows] = await Promise.all([
    sb.from('customers').select('*', { count: 'exact', head: true }).then((r) => r.count || 0).catch(() => 0),
    sb.from('jobs').select('status, priority, amount, scheduled_at, tech_name').then((r) => r.data || []).catch(() => []),
    (async () => {
      let total = 0, count = 0, from = 0;
      while (true) {
        const { data } = await sb.from('invoices').select('balance').eq('status', 'open').range(from, from + 999);
        if (!data || !data.length) break;
        data.forEach((d) => { total += Number(d.balance) || 0; });
        count += data.length; if (data.length < 1000) break; from += 1000;
      }
      return { total, count };
    })().catch(() => ({ total: 0, count: 0 })),
  ]);
  const open = jobRows.filter((j) => /scheduled|on_site|enroute/i.test(String(j.status || ''))).length;
  const urgent = jobRows.filter((j) => /high|urgent|emergency/i.test(String(j.priority || ''))).length;
  const done = jobRows.filter((j) => /done|complete/i.test(String(j.status || ''))).length;
  const booked = jobRows.reduce((a, j) => a + (Number(j.amount) || 0), 0);
  return { customers: custCount, jobs: { total: jobRows.length, open, urgent, completed: done, bookedDollars: Math.round(booked) }, ar: { outstandingDollars: Math.round(invRows.total), openInvoices: invRows.count } };
}

// Ask the Board — owner/GM/manager asks a plain-English question; Claude answers from live data.
export async function askBoard(question) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Not signed in.' };
  const role = roleOf(user);
  if (!can(role, 'seeReports')) return { ok: false, msg: 'Your role can’t use Ask the Board.' };

  const q = String(question || '').trim();
  if (!q) return { ok: false, msg: 'Ask a question.' };
  if (!isAdminConfigured) return { ok: false, msg: 'Supabase not configured.' };
  if (!isAiConfigured(role)) return { ok: false, msg: `No Claude key for your role yet — add ANTHROPIC_KEY_* in Vercel.` };

  const sb = getSupabaseAdmin();
  const ctx = await boardContext(sb);
  const anthropic = getAnthropic(role);

  let res;
  try {
    res = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      output_config: { effort: 'low' },
      system:
        'You are "Hank", the Clog Busterz dispatch assistant. Answer the question directly and concisely from the JSON business snapshot provided — no preamble, no restating the question. Use plain language and exact numbers. Money as $ with no decimals. If the snapshot does not contain the answer, say what data is missing. Keep it under 6 sentences.',
      messages: [{ role: 'user', content: `Business snapshot (live):\n${JSON.stringify(ctx)}\n\nQuestion: ${q}` }],
    });
  } catch (e) {
    return { ok: false, msg: 'AI error: ' + (e && e.message ? e.message : String(e)) };
  }

  const answer = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  // best-effort usage log → GM/Owner rollup (never block the answer)
  try {
    await sb.from('ai_usage').insert({
      role, screen: 'ask-board', model: AI_MODEL,
      input_tokens: res.usage?.input_tokens || 0, output_tokens: res.usage?.output_tokens || 0,
      user_email: user.email || '',
    });
  } catch (_) {}

  return { ok: true, answer: answer || '(no answer)' };
}
