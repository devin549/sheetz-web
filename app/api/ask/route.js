import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getAnthropic, isAiConfigured, AI_MODEL } from '@/lib/anthropic';
import { COMPANY } from '@/lib/company';
import { LOCATIONS } from '@/lib/rankConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PUBLIC customer brain — the website's "Ask Clog Busterz" assistant. Answers using the REAL pricebook
// (prices framed as "starting at", never a hard quote), service areas, and company facts. Customer-safe:
// never cost/margin/minimum/internal notes. Always nudges to book a free estimate for an exact price.
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const STOP = new Set(['the', 'and', 'for', 'with', 'how', 'much', 'cost', 'does', 'what', 'price', 'replace', 'repair', 'fix', 'a', 'an', 'my', 'in', 'is', 'it', 'to', 'of']);
export function OPTIONS() { return new NextResponse(null, { headers: CORS }); }

export async function POST(request) {
  let body = {}; try { body = await request.json(); } catch {}
  const question = String(body.question || '').trim().slice(0, 500);
  if (!question) return NextResponse.json({ ok: false, error: 'Ask a question.' }, { status: 400, headers: CORS });
  if (!isAiConfigured('office')) return NextResponse.json({ ok: false, answer: `For pricing and scheduling, call us at ${COMPANY.phone} or book online — we'll get you an exact quote.` }, { headers: CORS });

  const sb = getSupabaseAdmin();
  // Ground the answer in real "starting at" prices: match pricebook items to the question keywords.
  let priceLines = '';
  try {
    const words = question.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
    const { data } = await sb.from('pricebook_items').select('customer_name, name, retail_price').eq('active', true).eq('customer_visible', true).limit(2000);
    const matched = (data || []).map((it) => { const hay = `${it.customer_name || ''} ${it.name}`.toLowerCase(); const score = words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0); return { it, score }; })
      .filter((x) => x.score > 0 && Number(x.it.retail_price) > 0).sort((a, b) => b.score - a.score || a.it.retail_price - b.it.retail_price).slice(0, 8);
    priceLines = matched.map((m) => `- ${m.it.customer_name || m.it.name}: starting at $${Math.round(Number(m.it.retail_price))}`).join('\n');
  } catch (_) {}

  // 🧠 Team-fed knowledge base — authoritative manufacturer/code/field notes the office adds. Match by
  // keyword across topic/body/tags so the Brain "learns from Sheetz" (and cites the source). Fail-soft if
  // the table isn't there yet.
  let kbLines = '';
  try {
    const words = question.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
    const { data: kb } = await sb.from('brain_kb').select('topic, body, source_label, tags').eq('active', true).limit(1000);
    const hits = (kb || []).map((e) => {
      const hay = `${e.topic} ${e.body} ${(e.tags || []).join(' ')}`.toLowerCase();
      const score = words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0);
      return { e, score };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 4);
    kbLines = hits.map((h) => `- ${h.e.topic}: ${h.e.body}${h.e.source_label ? ` (Source: ${h.e.source_label})` : ''}`).join('\n');
  } catch (_) {}

  const towns = LOCATIONS.map((l) => l.split(',')[0]).join(', ');
  const system = `You are the friendly assistant on ${COMPANY.name}'s website, a family-owned plumbing company. Phone ${COMPANY.phone}. We serve ${towns} and nearby central Kentucky.
RULES:
- Prices are ALWAYS "starting at" — real jobs vary, so never give a fixed or guaranteed quote. Use the reference prices below as "starting at"; if none apply, say pricing depends on the job and offer a free estimate.
- Never mention cost, margin, or internal pricing — only customer "starting at" prices.
- For how-to, code, or manufacturer questions, rely on the Clog Busterz knowledge below when it applies; don't invent code citations or specs you weren't given. If you don't have a source, say a licensed plumber will confirm the specifics.
- Be warm, brief (2-4 sentences), helpful, and local. Always end by inviting them to book online or call ${COMPANY.phone} for an exact price.
${kbLines ? `Clog Busterz knowledge (authoritative — use this and you may name the source):\n${kbLines}\n` : ''}${priceLines ? `Reference starting-at prices:\n${priceLines}` : 'No matching catalog prices found — answer helpfully and point to a free estimate.'}`;

  try {
    const res = await getAnthropic('office').messages.create({ model: AI_MODEL, max_tokens: 350, system, messages: [{ role: 'user', content: question }] });
    const answer = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    try { await sb.from('ai_usage').insert({ role: 'public', screen: 'website-ask', model: AI_MODEL, input_tokens: res.usage?.input_tokens || 0, output_tokens: res.usage?.output_tokens || 0, user_email: '' }); } catch (_) {}
    return NextResponse.json({ ok: true, answer: answer || `Call us at ${COMPANY.phone} and we'll help.` }, { headers: CORS });
  } catch (e) { return NextResponse.json({ ok: false, answer: `Sorry — give us a call at ${COMPANY.phone} and we'll get you sorted.` }, { headers: CORS }); }
}
