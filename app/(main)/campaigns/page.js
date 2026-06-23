import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import { canCompose, canApprove } from '@/lib/campaigns';
import { isEmailConfigured, EMAIL_LIMITS } from '@/lib/email';
import Composer from './Composer';
import CampaignList from './CampaignList';

export const dynamic = 'force-dynamic';

// One usage bar (today / month) vs the Resend cap; turns amber at 90%, red when full.
function Meter({ label, used, limit }) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const near = used / limit >= 0.9;
  const color = used >= limit ? 'var(--red)' : near ? 'var(--amber)' : 'var(--green)';
  return (
    <div style={{ flex: 1, minWidth: 150 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span className="muted">{label}</span><span style={{ fontWeight: 700, color }}>{used.toLocaleString()} / {limit.toLocaleString()}</span></div>
      <div style={{ height: 7, background: 'var(--surface-2)', borderRadius: 5, marginTop: 4, overflow: 'hidden' }}><div style={{ width: pct + '%', height: '100%', background: color }} /></div>
    </div>
  );
}

export default async function Campaigns() {
  const { role } = await requireHref('/campaigns');
  const compose = canCompose(role);
  const approve = canApprove(role);

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">📣 Mass Email</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel to use campaigns.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const { data: campaignsRaw } = await sb.from('email_campaigns')
    .select('id, subject, audience_label, status, recipient_count, skipped_count, send_ok, send_fail, created_by, approved_by, created_at, sent_at')
    .order('created_at', { ascending: false }).limit(25);

  // open counts per campaign (email_sends.opened_at — column exists after migration 18; safe if not)
  const opens = {};
  const sentIds = (campaignsRaw || []).filter((c) => c.status === 'sent').map((c) => c.id);
  if (sentIds.length) {
    const { data: rows } = await sb.from('email_sends').select('campaign_id, opened_at').in('campaign_id', sentIds);
    (rows || []).forEach((r) => { if (r.opened_at) opens[r.campaign_id] = (opens[r.campaign_id] || 0) + 1; });
  }
  const campaigns = (campaignsRaw || []).map((c) => ({ ...c, opened: opens[c.id] || 0 }));

  // send usage vs the Resend cap (UTC day/month — matches Resend's reset). Safe before migration 21.
  const nowD = new Date();
  const startDay = new Date(Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth(), nowD.getUTCDate())).toISOString();
  const startMonth = new Date(Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth(), 1)).toISOString();
  let dayCount = 0, monthCount = 0;
  try {
    const d = await sb.from('email_events').select('id', { count: 'exact', head: true }).gte('created_at', startDay);
    const m = await sb.from('email_events').select('id', { count: 'exact', head: true }).gte('created_at', startMonth);
    dayCount = d.count || 0; monthCount = m.count || 0;
  } catch (_) {}
  const nearCap = dayCount / EMAIL_LIMITS.day >= 0.9 || monthCount / EMAIL_LIMITS.month >= 0.9;

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

      {/* send counter vs Resend cap + 90% upgrade alert */}
      <div className="card" style={{ border: nearCap ? '1px solid var(--amber)' : '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 800 }}>📊 Email usage</div>
          <Meter label="Today" used={dayCount} limit={EMAIL_LIMITS.day} />
          <Meter label="This month" used={monthCount} limit={EMAIL_LIMITS.month} />
        </div>
        {nearCap && <div style={{ marginTop: 9, color: 'var(--amber)', fontSize: 12.5, fontWeight: 700 }}>⚠️ Within 10% of your email limit — upgrade your Resend plan so sends don’t start failing. (Update <code>EMAIL_DAILY_LIMIT</code>/<code>EMAIL_MONTHLY_LIMIT</code> in Vercel after you upgrade.)</div>}
      </div>

      {compose && <Composer canCompose={compose} />}
      {!compose && approve && <div className="muted" style={{ fontSize: 13, margin: '10px 0' }}>You’re an <strong>approver</strong> — review and release the drafts below.</div>}

      <CampaignList campaigns={campaigns} canApprove={approve} emailReady={isEmailConfigured} />
    </div>
  );
}
