'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { roleOf } from '@/lib/nav';
import { buildProposal, selectTier } from '@/lib/pricebook';
import { revalidatePath } from 'next/cache';

// Who may build/present a price-book proposal (mirrors CB_PB.PRESENT_ROLES + owner/admin).
const PRESENT_ROLES = ['owner', 'admin', 'gm', 'om', 'accounting', 'fs', 'foreman', 'tech', 'helper', 'dispatcher', 'csr', 'sales', 'marketing'];

async function gate() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const role = roleOf(user);
  if (!user || !PRESENT_ROLES.includes(String(role).toLowerCase())) throw new Error('Your role can’t build estimates.');
  return { email: user.email || '' };
}

function pid() {
  // PB-<base36 time>-<rand> — random varies, no Date.now() inside the pricing math itself.
  return 'PB-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

// Record the customer's accepted tier. Builds the proposal server-side (authoritative), selects the
// tier (NO charge — invariant), persists the accepted estimate, returns the handoff for the office.
export async function recordEstimate({ customer, jobId, isMember, taxRate, tiers, tierKey }) {
  let email; try { ({ email } = await gate()); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const nowISO = new Date().toISOString();
  let proposal;
  try { proposal = buildProposal({ customer, jobId, isMember, taxRate, tiers }, { nowISO, proposalId: pid() }); }
  catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const res = selectTier(proposal, tierKey, { nowISO });
  if (!res.ok) return { ok: false, msg: res.error };

  const sb = getSupabaseAdmin();
  if (sb) {
    try {
      await sb.from('proposals').insert({
        id: proposal.proposalId, job_id: proposal.jobId || null, customer: proposal.customer || null,
        is_member: proposal.isMember, tax_rate: proposal.taxRate, status: proposal.status,
        recommended_key: proposal.recommendedKey, selected_key: proposal.selectedKey,
        accepted_total: res.acceptedTotal, tiers: proposal.tiers, created_by: email,
        updated_at: nowISO,
      });
    } catch (_) { /* table may not exist before mig 22 — still return the handoff */ }
  }
  revalidatePath('/estimate');
  return { ok: true, accepted: { tier: res.selectedKey, amount: res.acceptedTotal, estimate: res.estimate }, proposalId: proposal.proposalId };
}
