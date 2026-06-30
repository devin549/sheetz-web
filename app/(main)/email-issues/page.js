import Link from 'next/link';
import { requirePerm } from '@/lib/guard';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
const fmt = (iso) => { if (!iso) return ''; try { return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };
const PURPOSE = { invoice: 'Invoice', estimate: 'Estimate', statement: 'Statement', booking: 'Booking', reschedule: 'Reschedule', other: 'Email' };

// 📭 Email problems — every customer whose address bounced + recent failed/bounced sends, so nothing falls
// through the cracks. The bounce comes from the Resend webhook (/api/email/resend); fixes happen on the
// customer record (which clears the flag once corrected).
export default async function EmailIssues() {
  await requirePerm('seeFinancials', 'seeReports', 'manageUsers', 'assignJobs', 'contactCustomer');
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">Email problems</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;
  const sb = getSupabaseAdmin();

  let flagged = [], problems = [], pre158 = false;
  try { const { data, error } = await sb.from('customers').select('id, name, email, email2, email_status, email_bounced_at').in('email_status', ['bounced', 'complained']).order('email_bounced_at', { ascending: false }).limit(200); if (error) pre158 = true; else flagged = data || []; } catch (_) { pre158 = true; }
  try { const { data } = await sb.from('email_deliveries').select('id, to_email, purpose, ref, status, error, sent_at, customer_id').in('status', ['bounced', 'complained', 'failed']).order('sent_at', { ascending: false }).limit(60); problems = data || []; } catch (_) {}

  return (
    <div className="wrap" style={{ maxWidth: 820 }}>
      <div className="h1" style={{ marginBottom: 2 }}>📭 Email problems</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 14 }}>Customers who aren’t getting our emails — bounced, marked spam, or the send failed. Fix the address on the customer and the flag clears.</div>

      {pre158 && <div className="card" style={{ borderLeft: '3px solid var(--amber)', marginBottom: 12 }}><strong>Run supabase/158_email_delivery.sql</strong> to turn on bounce tracking, then add the webhook URL in Resend (settings card below the list).</div>}

      <h3 style={{ fontSize: 13, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 8px' }}>Bad customer emails ({flagged.length})</h3>
      {flagged.length === 0 ? (
        <div className="card"><span className="muted" style={{ fontSize: 13 }}>✓ No flagged customer emails — everyone’s reachable.</span></div>
      ) : flagged.map((c) => (
        <div key={c.id} className="card" style={{ marginBottom: 8, borderLeft: '3px solid var(--red)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{c.name || 'Customer'}</div>
            <div style={{ fontSize: 12.5, color: 'var(--red)', textDecoration: 'line-through' }}>{c.email}</div>
            <div className="muted" style={{ fontSize: 11 }}>{c.email_status === 'complained' ? 'Marked spam' : 'Bounced'}{c.email_bounced_at ? ` · ${fmt(c.email_bounced_at)}` : ''}{c.email2 ? ` · cc ${c.email2}` : ''}</div>
          </div>
          <Link href={`/customers/${c.id}`} className="btn" style={{ textDecoration: 'none', fontSize: 12.5 }}>Fix email →</Link>
        </div>
      ))}

      {problems.length > 0 && (<>
        <h3 style={{ fontSize: 13, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '18px 0 8px' }}>Recent delivery failures ({problems.length})</h3>
        <div className="card" style={{ display: 'grid', gap: 6 }}>
          {problems.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '7px 0', borderTop: '1px solid var(--border)', fontSize: 12.5 }}>
              <span className="pill" style={{ fontSize: 9.5, color: 'var(--red)', border: '1px solid var(--red)' }}>{p.status}</span>
              <strong>{PURPOSE[p.purpose] || 'Email'}</strong>
              <span className="muted">{p.to_email}{p.ref ? ` · ${p.ref}` : ''}</span>
              {p.customer_id && <Link href={`/customers/${p.customer_id}`} className="pill" style={{ fontSize: 10, color: 'var(--amber)' }}>customer →</Link>}
              <span className="muted" style={{ marginLeft: 'auto', fontSize: 11 }}>{fmt(p.sent_at)}</span>
            </div>
          ))}
        </div>
      </>)}

      <div className="card" style={{ marginTop: 16, fontSize: 11.5, color: 'var(--fg-2)', lineHeight: 1.6, borderLeft: '3px solid var(--purple)' }}>
        <strong style={{ color: 'var(--purple)' }}>⚙️ One-time setup (bounce detection):</strong><br />
        In the <strong>Resend dashboard → Webhooks</strong>, add an endpoint pointing at <code>/api/email/resend</code> on this site, subscribe to <code>email.bounced</code> + <code>email.complained</code> + <code>email.delivered</code>, then put its signing secret in Vercel as <code>RESEND_WEBHOOK_SECRET</code>. After that, a bad address flags itself here automatically.
      </div>
    </div>
  );
}
