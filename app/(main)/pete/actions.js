'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { roleOf } from '@/lib/nav';
import { canUsePete, canApprovePete, PURPOSE_KEYS, purposeLabel } from '@/lib/pete';
import { isVapiConfigured, normalizeE164, isTestNumber, placeCall } from '@/lib/vapi';
import { revalidatePath } from 'next/cache';

async function me() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { user, role: roleOf(user), email: (user && user.email) || '' };
}

// Collections context for the AI — current balance + days late on this customer's open invoices.
async function arForCustomer(sb, customerId) {
  if (!customerId) return { balanceDollars: 0, daysLate: null };
  const { data } = await sb.from('invoices').select('balance, invoice_date').eq('customer_id', customerId).eq('status', 'open');
  let bal = 0, oldest = null;
  (data || []).forEach((i) => { bal += Number(i.balance) || 0; if (i.invoice_date) { const t = new Date(i.invoice_date).getTime(); if (!Number.isNaN(t) && (oldest == null || t < oldest)) oldest = t; } });
  return { balanceDollars: Math.round(bal), daysLate: oldest ? Math.floor((Date.now() - oldest) / 86400000) : null };
}

function buildVars(call, ar) {
  return {
    company: 'Clog Busterz Plumbing',
    customerName: call.customer_name || 'there',
    purpose: purposeLabel(call.purpose),
    note: call.script_note || '',
    balanceDollars: ar ? ar.balanceDollars : '',
    daysLate: ar ? (ar.daysLate == null ? '' : ar.daysLate) : '',
  };
}

// QUEUE — create a call. TEST numbers (internal allowlist) dial immediately; real customers wait for
// an approver. Without VAPI keys, even test calls just queue (nothing dials).
export async function queueCall({ customerId, toPhone, name, purpose, scriptNote, testMode }) {
  const { user, role, email } = await me();
  if (!user || !canUsePete(role)) return { ok: false, msg: 'Your role can’t use Plunger Pete.' };
  if (!PURPOSE_KEYS.includes(purpose)) return { ok: false, msg: 'Pick a call purpose.' };
  const e164 = normalizeE164(toPhone);
  if (!e164) return { ok: false, msg: `“${toPhone}” isn’t a valid US phone number.` };

  const isTest = isTestNumber(e164);
  // The safety rail: a "test" call must target a PETE_TEST_NUMBERS phone. Real numbers can’t be
  // back-doored through test mode.
  if (testMode && !isTest) return { ok: false, msg: 'Test mode only dials a number on the PETE_TEST_NUMBERS allowlist. Add yours there first.' };

  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };

  const { data: call, error } = await sb.from('pete_calls').insert({
    customer_id: customerId || null, customer_name: name || '', to_phone: e164, purpose,
    script_note: String(scriptNote || '').slice(0, 1000), is_test: isTest,
    status: isTest ? 'approved' : 'queued', requested_by: email,
    approved_by: isTest ? email : null,
  }).select('*').single();
  if (error) return { ok: false, msg: error.message };

  // Internal test call → safe to dial right now.
  if (isTest) {
    if (!isVapiConfigured) { revalidatePath('/pete'); return { ok: true, queued: true, msg: 'Logged a test call — add the VAPI_* keys in Vercel to actually dial.' }; }
    const ar = purpose === 'collections' ? await arForCustomer(sb, customerId) : null;
    const r = await placeCall({ toE164: e164, name, variableValues: buildVars(call, ar) });
    if (r.ok) await sb.from('pete_calls').update({ status: 'calling', vapi_call_id: r.callId, called_at: new Date().toISOString() }).eq('id', call.id);
    else await sb.from('pete_calls').update({ status: 'failed', ended_reason: r.error }).eq('id', call.id);
    revalidatePath('/pete');
    return r.ok ? { ok: true, msg: '📞 Test call dialing…' } : { ok: false, msg: r.error };
  }

  revalidatePath('/pete');
  return { ok: true, queued: true, msg: 'Queued — an approver (owner / GM / Tracey / Ashley) must release it before Pete calls a customer.' };
}

// APPROVE + CALL — internal-approver only. Releases a queued REAL customer call.
export async function approveAndCall(callId) {
  const { user, role, email } = await me();
  if (!user || !canApprovePete(role)) return { ok: false, msg: 'Only an internal approver (owner / GM / office / accounting) can release a customer call.' };
  if (!callId) return { ok: false, msg: 'No call.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };

  const { data: call } = await sb.from('pete_calls').select('*').eq('id', callId).maybeSingle();
  if (!call) return { ok: false, msg: 'Call not found.' };
  if (!['queued', 'approved'].includes(call.status)) return { ok: false, msg: `Already ${call.status}.` };

  if (!isVapiConfigured) {
    await sb.from('pete_calls').update({ status: 'approved', approved_by: email }).eq('id', callId);
    revalidatePath('/pete');
    return { ok: false, needsKey: true, msg: 'Approved — add the VAPI_* keys in Vercel to actually dial.' };
  }

  const ar = call.purpose === 'collections' ? await arForCustomer(sb, call.customer_id) : null;
  const r = await placeCall({ toE164: call.to_phone, name: call.customer_name, variableValues: buildVars(call, ar) });
  if (r.ok) await sb.from('pete_calls').update({ status: 'calling', vapi_call_id: r.callId, approved_by: email, called_at: new Date().toISOString() }).eq('id', callId);
  else await sb.from('pete_calls').update({ status: 'failed', approved_by: email, ended_reason: r.error }).eq('id', callId);
  revalidatePath('/pete');
  return r.ok ? { ok: true, msg: '📞 Calling…' } : { ok: false, msg: r.error };
}

export async function cancelCall(callId) {
  const { user, role } = await me();
  if (!user || !canUsePete(role)) return { ok: false, msg: 'Not allowed.' };
  const sb = getSupabaseAdmin();
  const { data: call } = await sb.from('pete_calls').select('status').eq('id', callId).maybeSingle();
  if (call && ['calling', 'completed'].includes(call.status)) return { ok: false, msg: 'Too late — the call already went out.' };
  await sb.from('pete_calls').update({ status: 'canceled' }).eq('id', callId);
  revalidatePath('/pete');
  return { ok: true };
}
