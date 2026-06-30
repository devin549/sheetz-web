'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { canCompose, canApprove, AUDIENCE_KEYS, audienceLabel, audienceBrief, WH_AGE_YEARS } from '@/lib/campaigns';
import { getAnthropic, isAiConfigured, AI_MODEL } from '@/lib/anthropic';
import { isEmailConfigured, sendOne, renderEmailHtml } from '@/lib/email';
import { loadProfile } from '@/lib/profile';
import { revalidatePath } from 'next/cache';

async function me() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await loadProfile(user) : null;
  const inactive = profile && profile.active === false; // deactivated login → treat as signed-out
  return { user: inactive ? null : user, role: (profile && !inactive) ? profile.role : 'viewer', email: (user && user.email) || '' };
}

// Resolve an audience preset → de-duped recipient list. do_not_mail + empty emails are skipped
// (counted, never silently dropped). Returns { recipients:[{customer_id,name,email}], skipped }.
const WH_FUEL = { wh_gas: 'gas', wh_electric: 'electric', wh_propane: 'propane' };
async function resolveAudience(sb, key) {
  let custIds = null; // null = every customer with an email
  // Aging water heaters by fuel — customers whose scanned data plate shows a 9+ yr-old unit of that fuel.
  if (WH_FUEL[key]) {
    const fuel = WH_FUEL[key];
    const maxYear = new Date().getFullYear() - WH_AGE_YEARS;
    const set = new Set();
    let from = 0;
    while (true) {
      const { data, error } = await sb.from('customer_equipment').select('customer_id, fuel_type, year').not('customer_id', 'is', null).not('year', 'is', null).lte('year', maxYear).range(from, from + 999);
      if (error || !data || !data.length) break;
      data.forEach((e) => {
        const f = String(e.fuel_type || '').toLowerCase();
        const match = fuel === 'gas' ? (/gas/.test(f) && !/propane|lp\b/.test(f)) : fuel === 'propane' ? /propane|lp\b/.test(f) : /electric/.test(f);
        if (match && e.customer_id) set.add(e.customer_id);
      });
      if (data.length < 1000) break; from += 1000;
    }
    custIds = [...set];
    if (!custIds.length) return { recipients: [], skipped: 0 };
  }
  if (key === 'pastdue' || key === 'pastdue90') {
    const cutoff = key === 'pastdue90' ? Date.now() - 90 * 86400000 : null;
    const set = new Set();
    let from = 0;
    while (true) {
      const { data } = await sb.from('invoices').select('customer_id, invoice_date').eq('status', 'open').range(from, from + 999);
      if (!data || !data.length) break;
      data.forEach((i) => {
        if (!i.customer_id) return;
        if (cutoff) { const t = i.invoice_date ? new Date(i.invoice_date).getTime() : null; if (!(t && t < cutoff)) return; }
        set.add(i.customer_id);
      });
      if (data.length < 1000) break; from += 1000;
    }
    custIds = [...set];
    if (!custIds.length) return { recipients: [], skipped: 0 };
  }

  const recipients = []; const seen = new Set(); let skipped = 0;
  const take = (rows) => (rows || []).forEach((c) => {
    const email = String(c.email || '').trim().toLowerCase();
    if (!email || c.do_not_mail) { skipped++; return; }
    if (seen.has(email)) return; seen.add(email);
    recipients.push({ customer_id: c.id, name: c.name || '', email });
  });

  if (custIds) {
    for (let i = 0; i < custIds.length; i += 300) {
      const { data } = await sb.from('customers').select('id, name, email, do_not_mail').in('id', custIds.slice(i, i + 300));
      take(data);
    }
  } else {
    let from = 0;
    while (true) {
      const { data } = await sb.from('customers').select('id, name, email, do_not_mail').not('email', 'is', null).range(from, from + 999);
      if (!data || !data.length) break;
      take(data);
      if (data.length < 1000) break; from += 1000;
    }
  }
  return { recipients, skipped };
}

// PREVIEW — return the full pickable recipient list so the composer can hand-pick a batch.
// Capped so a 13k all-customers list can’t blow up the response; whole-audience mode (createCampaign
// with no includeIds) is unaffected by the cap.
const PREVIEW_CAP = 2000;
export async function previewAudience(audience) {
  const { user, role } = await me();
  if (!user || !canCompose(role)) return { ok: false, msg: 'Your role can’t build campaigns.' };
  if (!AUDIENCE_KEYS.includes(audience)) return { ok: false, msg: 'Pick an audience.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  const { recipients, skipped } = await resolveAudience(sb, audience);
  const truncated = recipients.length > PREVIEW_CAP;
  return {
    ok: true, count: recipients.length, skipped, truncated,
    recipients: recipients.slice(0, PREVIEW_CAP).map((r) => ({ id: r.customer_id, name: r.name, email: r.email })),
  };
}

// DRAFT WITH HANK — AI writes a subject + body for the chosen audience.
export async function draftCampaignAI(audience, brief) {
  const { user, role } = await me();
  if (!user || !canCompose(role)) return { ok: false, msg: 'Your role can’t build campaigns.' };
  if (!isAiConfigured(role)) return { ok: false, msg: 'No Claude key for your role yet — add ANTHROPIC_KEY_* in Vercel.' };
  const anthropic = getAnthropic(role);
  let res;
  try {
    res = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 700,
      output_config: { effort: 'low' },
      system: 'You write short, warm, professional customer emails for Clog Busterz Plumbing (a Kentucky plumbing company). Plain text only. Use {{name}} where the customer’s first name should go. No spammy hype, no ALL CAPS, no emoji walls. Return STRICT JSON: {"subject": "...", "body": "..."} and nothing else.',
      messages: [{ role: 'user', content: `Audience: ${audienceLabel(audience)}.\nWhat to say: ${String(brief || audienceBrief(audience) || 'a friendly check-in / notice').slice(0, 800)}\n\nReturn the JSON.` }],
    });
  } catch (e) { return { ok: false, msg: 'AI error: ' + ((e && e.message) || String(e)) }; }
  const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  let parsed = null; try { parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch (_) {}
  try {
    const sb = getSupabaseAdmin();
    await sb.from('ai_usage').insert({ role, screen: 'campaign-draft', model: AI_MODEL, input_tokens: res.usage?.input_tokens || 0, output_tokens: res.usage?.output_tokens || 0, user_email: user.email || '' });
  } catch (_) {}
  if (!parsed || !parsed.body) return { ok: false, msg: 'AI didn’t return a usable draft — try again.' };
  return { ok: true, subject: String(parsed.subject || '').slice(0, 200), body: String(parsed.body || '').slice(0, 4000) };
}

// CREATE — snapshot the recipient list into email_sends (queued) + a pending_approval campaign.
// This does NOT send. An approver must release it. `includeIds` (customer ids) = the hand-picked
// batch; omit/null to use the whole audience. Emails + do_not_mail are ALWAYS re-validated server-
// side (the client only picks which of the resolved recipients to include).
export async function createCampaign({ subject, body, audience, includeIds }) {
  const { user, role, email } = await me();
  if (!user || !canCompose(role)) return { ok: false, msg: 'Your role can’t build campaigns.' };
  const subj = String(subject || '').trim(); const bod = String(body || '').trim();
  if (!subj || !bod) return { ok: false, msg: 'Subject and message are both required.' };
  if (!AUDIENCE_KEYS.includes(audience)) return { ok: false, msg: 'Pick an audience.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };

  const { recipients, skipped } = await resolveAudience(sb, audience);
  if (!recipients.length) return { ok: false, msg: 'That audience has 0 mailable customers right now.' };

  // hand-picked batch → keep only the chosen customer ids (server still owns the email/do_not_mail truth)
  let chosen = recipients;
  if (Array.isArray(includeIds)) {
    const set = new Set(includeIds);
    chosen = recipients.filter((r) => set.has(r.customer_id));
    if (!chosen.length) return { ok: false, msg: 'No recipients selected — pick at least one.' };
  }
  const deselected = recipients.length - chosen.length;

  const { data: camp, error } = await sb.from('email_campaigns').insert({
    subject: subj, body: bod, audience,
    audience_label: deselected > 0 ? `${audienceLabel(audience)} · batch of ${chosen.length}` : audienceLabel(audience),
    status: 'pending_approval', recipient_count: chosen.length, skipped_count: skipped, created_by: email,
  }).select('id').single();
  if (error) return { ok: false, msg: error.message };

  // snapshot recipients (batched insert) so the list can’t shift between approval and send
  const rows = chosen.map((r) => ({ campaign_id: camp.id, customer_id: r.customer_id, customer_name: r.name, to_email: r.email, status: 'queued' }));
  for (let i = 0; i < rows.length; i += 500) { await sb.from('email_sends').insert(rows.slice(i, i + 500)); }

  revalidatePath('/campaigns');
  return { ok: true, id: camp.id, count: chosen.length, skipped, deselected };
}

// SEND A TEST TO MYSELF — fires ONE email of this campaign to the signed-in user's own address so
// they can eyeball the formatting before an approver releases the batch. Open to composer/approver.
export async function sendTestToMe(campaignId) {
  const { user, role, email } = await me();
  if (!user || (!canCompose(role) && !canApprove(role))) return { ok: false, msg: 'Your role can’t test campaigns.' };
  if (!campaignId) return { ok: false, msg: 'No campaign.' };
  if (!email) return { ok: false, msg: 'Your account has no email address.' };
  if (!isEmailConfigured) return { ok: false, msg: 'Add EMAIL_API_KEY (Resend) + EMAIL_FROM in Vercel to send a test.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  const { data: camp } = await sb.from('email_campaigns').select('subject, body').eq('id', campaignId).maybeSingle();
  if (!camp) return { ok: false, msg: 'Campaign not found.' };
  const first = (email.split('@')[0] || 'there');
  const personalized = camp.body.replace(/\{\{\s*name\s*\}\}/gi, first);
  const r = await sendOne({ to: email, subject: `[TEST] ${camp.subject}`, html: renderEmailHtml({ subject: camp.subject, body: personalized }) });
  return r.ok ? { ok: true, msg: `✅ Test sent to ${email} — check your inbox.` } : { ok: false, msg: r.error };
}

// APPROVE + SEND — internal-approver only. Sends every queued recipient, logs each result.
export async function approveAndSend(campaignId) {
  const { user, role, email } = await me();
  if (!user || !canApprove(role)) return { ok: false, msg: 'Only an internal approver (owner / GM / office / accounting) can send.' };
  if (!campaignId) return { ok: false, msg: 'No campaign.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };

  const { data: camp } = await sb.from('email_campaigns').select('*').eq('id', campaignId).maybeSingle();
  if (!camp) return { ok: false, msg: 'Campaign not found.' };
  if (!['pending_approval', 'approved'].includes(camp.status)) return { ok: false, msg: `Already ${camp.status}.` };
  if (!isEmailConfigured) {
    await sb.from('email_campaigns').update({ status: 'approved', approved_by: email, approved_at: new Date().toISOString() }).eq('id', campaignId);
    revalidatePath('/campaigns');
    return { ok: false, needsKey: true, msg: 'Approved — but add EMAIL_API_KEY (Resend) in Vercel to actually send.' };
  }

  await sb.from('email_campaigns').update({ status: 'sending', approved_by: email, approved_at: new Date().toISOString() }).eq('id', campaignId);

  let ok = 0, fail = 0, from = 0;
  while (true) {
    const { data: batch } = await sb.from('email_sends').select('id, to_email, customer_name').eq('campaign_id', campaignId).eq('status', 'queued').range(from, from + 49);
    if (!batch || !batch.length) break;
    for (const s of batch) {
      const first = String(s.customer_name || '').trim().split(/\s+/)[0] || 'there';
      const personalized = camp.body.replace(/\{\{\s*name\s*\}\}/gi, first);
      const r = await sendOne({ to: s.to_email, subject: camp.subject, html: renderEmailHtml({ subject: camp.subject, body: personalized, trackId: s.id }) });
      if (r.ok) { ok++; await sb.from('email_sends').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', s.id); }
      else { fail++; await sb.from('email_sends').update({ status: 'failed', error: r.error || 'send failed' }).eq('id', s.id); }
      await new Promise((res) => setTimeout(res, 120)); // ~8/sec — stays under Resend's rate cap
    }
    // queued rows just flipped to sent/failed, so keep reading from 0
  }

  await sb.from('email_campaigns').update({ status: 'sent', sent_at: new Date().toISOString(), send_ok: ok, send_fail: fail }).eq('id', campaignId);
  revalidatePath('/campaigns');
  return { ok: true, sent: ok, failed: fail };
}

// CANCEL — kill a draft before it goes out (composer or approver).
export async function cancelCampaign(campaignId) {
  const { user, role } = await me();
  if (!user || (!canCompose(role) && !canApprove(role))) return { ok: false, msg: 'Not allowed.' };
  if (!campaignId) return { ok: false, msg: 'No campaign.' };
  const sb = getSupabaseAdmin();
  const { data: camp } = await sb.from('email_campaigns').select('status').eq('id', campaignId).maybeSingle();
  if (camp && ['sending', 'sent'].includes(camp.status)) return { ok: false, msg: 'Too late — it already sent.' };
  await sb.from('email_campaigns').update({ status: 'canceled' }).eq('id', campaignId);
  revalidatePath('/campaigns');
  return { ok: true };
}
