import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import { canUsePete, canApprovePete } from '@/lib/pete';
import { isVapiConfigured, testNumbers } from '@/lib/vapi';
import PeteConsole from './PeteConsole';

export const dynamic = 'force-dynamic';

export default async function Pete({ searchParams }) {
  const { role } = await requireHref('/pete');
  const approve = canApprovePete(role);

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">📞 Plunger Pete</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel to use Pete.</div></div>;
  }
  const sb = getSupabaseAdmin();

  // optional prefill from the AR collections timeline
  let prefill = { customerId: searchParams?.customer || '', name: '', phone: '', purpose: searchParams?.purpose || 'collections' };
  if (prefill.customerId) {
    const { data: c } = await sb.from('customers').select('name, phone').eq('id', prefill.customerId).maybeSingle();
    if (c) { prefill.name = c.name || ''; prefill.phone = c.phone || ''; }
  }

  const { data: calls } = await sb.from('pete_calls')
    .select('id, customer_name, to_phone, purpose, status, is_test, recording_url, summary, ended_reason, duration_s, requested_by, approved_by, created_at')
    .order('created_at', { ascending: false }).limit(30);

  const allow = testNumbers();

  return (
    <div className="wrap" style={{ maxWidth: 1000 }}>
      <div className="h1">📞 Plunger Pete <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>· AI calling</span></div>

      <div className="notice" style={{ fontSize: 12.5 }}>
        <strong>How this works (on purpose):</strong> queue a call → an <strong>internal approver</strong> (owner / GM / Tracey / Ashley)
        releases it before Pete ever dials a real customer. <strong>Test calls</strong> only ring numbers on your
        <code> PETE_TEST_NUMBERS</code> allowlist{allow.length ? ` (${allow.length} set)` : ' (none set yet)'} — that’s how you trial Pete safely first. Every call is recorded + logged.
        {!isVapiConfigured && <div style={{ marginTop: 8, color: 'var(--amber)' }}>⚙️ Queue + approve work now. To actually <strong>dial</strong>, add <code>VAPI_API_KEY</code>, <code>VAPI_PHONE_NUMBER_ID</code>, <code>VAPI_ASSISTANT_ID</code> (+ <code>VAPI_WEBHOOK_SECRET</code>, <code>PETE_TEST_NUMBERS</code>) in Vercel.</div>}
      </div>

      <PeteConsole prefill={prefill} calls={calls || []} canApprove={approve} vapiReady={isVapiConfigured} hasTestNumbers={allow.length > 0} />
    </div>
  );
}
