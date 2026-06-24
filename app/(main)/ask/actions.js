'use server';

import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { getAnthropic, isAiConfigured, keyForRole, AI_MODEL } from '@/lib/anthropic';

// Gather a compact, live snapshot of the business for the model to reason over — now including
// the top past-due customers + the single oldest invoice, so Hank can answer "who owes the most"
// and "who has the oldest invoice".
export async function boardContext(sb) {
  const days = (t) => (t ? Math.floor((Date.now() - t) / 86400000) : null);

  const [custCount, jobRows] = await Promise.all([
    sb.from('customers').select('*', { count: 'exact', head: true }).then((r) => r.count || 0).catch(() => 0),
    sb.from('jobs').select('status, priority, amount').then((r) => r.data || []).catch(() => []),
  ]);

  // open invoices → totals + per-customer rollup + oldest
  const byCust = {}; let total = 0, count = 0, from = 0, oldest = null;
  while (true) {
    const { data } = await sb.from('invoices').select('balance, invoice_date, customer_id, invoice_number').eq('status', 'open').range(from, from + 999);
    if (!data || !data.length) break;
    data.forEach((i) => {
      const bal = Number(i.balance) || 0; total += bal; count++;
      const cid = i.customer_id || 'none';
      const g = byCust[cid] = byCust[cid] || { total: 0, n: 0, oldest: null };
      g.total += bal; g.n++;
      if (i.invoice_date) {
        const t = new Date(i.invoice_date).getTime();
        if (!Number.isNaN(t)) { if (g.oldest == null || t < g.oldest) g.oldest = t; if (oldest == null || t < oldest.t) oldest = { t, cid, inv: i.invoice_number }; }
      }
    });
    if (data.length < 1000) break; from += 1000;
  }
  const ranked = Object.entries(byCust).map(([cid, g]) => ({ cid, ...g })).sort((a, b) => b.total - a.total).slice(0, 5);
  const ids = [...new Set([...ranked.map((r) => r.cid), oldest && oldest.cid].filter((x) => x && x !== 'none'))];
  const names = {};
  if (ids.length) { const { data: cs } = await sb.from('customers').select('id, name').in('id', ids); (cs || []).forEach((c) => { names[c.id] = c.name; }); }

  const topPastDue = ranked.map((r) => ({ customer: names[r.cid] || 'Unknown', owesDollars: Math.round(r.total), invoices: r.n, oldestDaysLate: days(r.oldest) }));
  const oldestInvoice = oldest ? { customer: names[oldest.cid] || 'Unknown', invoiceNumber: oldest.inv, daysLate: days(oldest.t) } : null;

  const open = jobRows.filter((j) => /scheduled|on_site|enroute/i.test(String(j.status || ''))).length;
  const urgent = jobRows.filter((j) => /high|urgent|emergency/i.test(String(j.priority || ''))).length;
  const done = jobRows.filter((j) => /done|complete/i.test(String(j.status || ''))).length;
  const booked = jobRows.reduce((a, j) => a + (Number(j.amount) || 0), 0);

  return {
    customers: custCount,
    jobs: { total: jobRows.length, open, urgent, completed: done, bookedDollars: Math.round(booked) },
    ar: { outstandingDollars: Math.round(total), openInvoices: count },
    topPastDue, oldestInvoice,
  };
}

// Ask the Board — owner/GM/manager asks a plain-English question; Claude answers from live data.
export async function askBoard(question) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Not signed in.' };
  const profile = await loadProfile(user);
  const role = profile.role;
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
