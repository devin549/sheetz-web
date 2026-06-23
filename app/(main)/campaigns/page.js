import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import { canCompose, canApprove } from '@/lib/campaigns';
import { isEmailConfigured } from '@/lib/email';
import Composer from './Composer';
import CampaignList from './CampaignList';

export const dynamic = 'force-dynamic';

export default async function Campaigns() {
  const { role } = await requireHref('/campaigns');
  const compose = canCompose(role);
  const approve = canApprove(role);

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">📣 Mass Email</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel to use campaigns.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const { data: campaigns } = await sb.from('email_campaigns')
    .select('id, subject, audience_label, status, recipient_count, skipped_count, send_ok, send_fail, created_by, approved_by, created_at, sent_at')
    .order('created_at', { ascending: false }).limit(25);

  return (
    <div className="wrap" style={{ maxWidth: 1100 }}>
      <div className="h1">📣 Mass Email <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>· campaigns &amp; notices</span></div>

      {/* the guardrail, stated up front */}
      <div className="notice" style={{ fontSize: 12.5 }}>
        <strong>How this works (on purpose):</strong> compose a draft → preview exactly who it hits →
        an <strong>internal approver</strong> (owner / GM / Tracey / Ashley) clicks <em>Send</em>. Never a one-click blast.
        Customers flagged <code>do_not_mail</code> or with no email are skipped automatically, and every single send is logged.
        {!isEmailConfigured && <div style={{ marginTop: 8, color: 'var(--amber)' }}>⚙️ Drafting + approval work now. To actually <strong>send</strong>, add <code>EMAIL_API_KEY</code> (Resend) + <code>EMAIL_FROM</code> in Vercel.</div>}
      </div>

      {compose && <Composer canCompose={compose} />}
      {!compose && approve && <div className="muted" style={{ fontSize: 13, margin: '10px 0' }}>You’re an <strong>approver</strong> — review and release the drafts below.</div>}

      <CampaignList campaigns={campaigns || []} canApprove={approve} emailReady={isEmailConfigured} />
    </div>
  );
}
