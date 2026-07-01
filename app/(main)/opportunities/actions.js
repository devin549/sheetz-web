'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { canCompose } from '@/lib/campaigns';
import { canWorkOpportunities } from '@/lib/opportunities';

const clean = (v, n = 300) => String(v == null ? '' : v).trim().slice(0, n);

async function me() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await loadProfile(user) : null;
  const inactive = profile && profile.active === false;
  return { user: inactive ? null : user, role: (profile && !inactive) ? profile.role : 'viewer', email: (user && user.email) || '' };
}

// Set the status on ONE opportunity. Native tech-recs update their own row (oppId). Live-source items
// (declined estimate / aging heater) get a status MARKER upserted, keyed by `source` = the ref, so the
// decision sticks without materializing the whole source stream.
export async function setOpportunityStatus(payload) {
  const { user, role, email } = await me();
  if (!user || !canWorkOpportunities(role)) return { ok: false, msg: 'Your role can’t work follow-ups.' };
  const { oppId, ref, kind, customerId, jobId, title, valueCents, status, reason } = payload || {};
  if (!['open', 'won', 'dismissed', 'sent'].includes(status)) return { ok: false, msg: 'Bad status.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };

  const stamp = { status, updated_at: new Date().toISOString() };
  if (status === 'won') stamp.won_at = new Date().toISOString();
  if (status === 'dismissed') { stamp.dismissed_at = new Date().toISOString(); stamp.dismissed_reason = clean(reason, 200) || null; }
  if (status === 'sent') stamp.sent_at = new Date().toISOString();

  let err = null;
  if (oppId) {
    ({ error: err } = await sb.from('opportunities').update(stamp).eq('id', oppId));
  } else {
    if (!ref || !customerId) return { ok: false, msg: 'Missing row reference.' };
    // Upsert the marker by (kind, source=ref): update if it exists, else insert.
    const { data: existing } = await sb.from('opportunities').select('id').eq('kind', kind).eq('source', ref).maybeSingle();
    if (existing?.id) ({ error: err } = await sb.from('opportunities').update(stamp).eq('id', existing.id));
    else ({ error: err } = await sb.from('opportunities').insert({
      customer_id: customerId, job_id: jobId || null, kind, source: ref, title: clean(title, 160) || 'Opportunity',
      est_value_cents: valueCents || null, created_by: user.id, created_by_name: email, ...stamp,
    }));
  }
  if (err) return { ok: false, msg: /relation|column|schema cache|does not exist/i.test(err.message || '') ? 'Run supabase/159_opportunities.sql first.' : err.message };
  try { await sb.from('audit_log').insert({ actor_id: user.id, actor_name: email, role, action: `opportunity.${status}`, entity: 'customer', entity_id: String(customerId || ''), detail: { ref, kind } }); } catch (_) {}
  revalidatePath('/opportunities');
  return { ok: true, msg: status === 'won' ? '🏆 Marked won.' : status === 'dismissed' ? 'Dismissed.' : status === 'open' ? 'Reopened.' : 'Updated.' };
}

// BATCH → campaign draft. Take the picked customers, snapshot them into a pending_approval campaign +
// queued email_sends (same shape the campaigns page reads), and mark those opportunities 'sent'. This does
// NOT send — an internal approver still releases it from /campaigns. Never auto-sends to customers.
export async function draftCampaignFromOpportunities({ rows, subject, body }) {
  const { user, role, email } = await me();
  if (!user || !canCompose(role)) return { ok: false, msg: 'Your role can’t build campaigns (needs contact + reports).' };
  const subj = clean(subject, 200); const bod = clean(body, 4000);
  if (!subj || !bod) return { ok: false, msg: 'Subject and message are both required.' };
  const picked = (Array.isArray(rows) ? rows : []).filter((r) => r && r.customerId);
  if (!picked.length) return { ok: false, msg: 'Pick at least one customer.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };

  // Re-validate emails + do_not_mail server-side (the client only picks which rows).
  const ids = [...new Set(picked.map((r) => r.customerId))];
  const recips = []; const seen = new Set(); let skipped = 0;
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await sb.from('customers').select('id, name, email, do_not_mail').in('id', ids.slice(i, i + 300));
    (data || []).forEach((c) => {
      const e = String(c.email || '').trim().toLowerCase();
      if (!e || c.do_not_mail) { skipped++; return; }
      if (seen.has(e)) return; seen.add(e);
      recips.push({ customer_id: c.id, name: c.name || '', email: e });
    });
  }
  if (!recips.length) return { ok: false, msg: 'None of the picked customers have a mailable email on file.' };

  const { data: camp, error } = await sb.from('email_campaigns').insert({
    subject: subj, body: bod, audience: 'allcustomers',
    audience_label: `🎯 Win-back · ${recips.length} picked`, status: 'pending_approval',
    recipient_count: recips.length, skipped_count: skipped, created_by: email,
  }).select('id').single();
  if (error) return { ok: false, msg: error.message };

  const sends = recips.map((r) => ({ campaign_id: camp.id, customer_id: r.customer_id, customer_name: r.name, to_email: r.email, status: 'queued' }));
  for (let i = 0; i < sends.length; i += 500) { await sb.from('email_sends').insert(sends.slice(i, i + 500)); }

  // Mark the picked opportunities 'sent' so the board clears them (approver still has to release the email).
  const mailedIds = new Set(recips.map((r) => r.customer_id));
  for (const r of picked) {
    if (!mailedIds.has(r.customerId)) continue;
    try {
      if (r.oppId) await sb.from('opportunities').update({ status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', r.oppId);
      else if (r.ref) {
        const { data: ex } = await sb.from('opportunities').select('id').eq('kind', r.kind).eq('source', r.ref).maybeSingle();
        if (ex?.id) await sb.from('opportunities').update({ status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', ex.id);
        else await sb.from('opportunities').insert({ customer_id: r.customerId, job_id: r.jobId || null, kind: r.kind, source: r.ref, title: clean(r.title, 160) || 'Opportunity', est_value_cents: r.valueCents || null, status: 'sent', sent_at: new Date().toISOString(), created_by: user.id, created_by_name: email });
      }
    } catch (_) {}
  }
  try { await sb.from('audit_log').insert({ actor_id: user.id, actor_name: email, role, action: 'opportunity.campaign_drafted', entity: 'campaign', entity_id: String(camp.id), detail: { count: recips.length } }); } catch (_) {}
  revalidatePath('/opportunities'); revalidatePath('/campaigns');
  return { ok: true, id: camp.id, count: recips.length, skipped, msg: `📝 Draft built for ${recips.length} — an approver releases it from Campaigns.` };
}
