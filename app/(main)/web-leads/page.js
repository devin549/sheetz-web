import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import LeadsClient from './LeadsClient';

export const dynamic = 'force-dynamic';

export default async function WebLeads() {
  await requirePerm('createJobs', 'contactCustomer');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Web Leads</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('web_leads')
    .select('id, name, phone, email, address, service, message, source, status, job_id, created_at')
    .order('created_at', { ascending: false }).limit(100);

  const missing = error && /could not find|does not exist|schema cache/i.test(error.message || '');
  const leads = data || [];
  const newCount = leads.filter((l) => l.status === 'new').length;

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <div className="h1">Web Leads{newCount ? <span className="pill pill-red" style={{ marginLeft: 10, fontSize: 12, verticalAlign: 'middle' }}>{newCount} new</span> : null}</div>
      <p className="muted">Inbound leads from the website — work them and book the good ones.</p>

      <details className="card" style={{ fontSize: 12.5 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>📡 Receiving leads — wire your site form</summary>
        <div style={{ marginTop: 8, lineHeight: 1.65 }}>
          POST your form to <code>/api/leads</code> (JSON or form-encoded). Fields: <code>name, phone, email, address, service, message</code>.
          Add a hidden <code>company</code> field as a bot honeypot. If you set <code>WEB_LEADS_INTAKE_SECRET</code> in Vercel,
          send it as header <code>x-cb-intake-key</code>.
          <pre style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginTop: 8, overflowX: 'auto', fontSize: 11.5 }}>{`curl -X POST https://YOUR-SITE/api/leads \\
  -H "content-type: application/json" \\
  -d '{"name":"Jane Smith","phone":"8595550123","service":"Drain clog","message":"Kitchen sink backed up"}'`}</pre>
        </div>
      </details>

      {missing
        ? <div className="notice">Web Leads needs its table — run <code>supabase/28_web_leads.sql</code> in Supabase. Then point your site form at it.</div>
        : error
          ? <div className="notice">Couldn’t load: {error.message}</div>
          : <LeadsClient leads={leads} />}
    </div>
  );
}
