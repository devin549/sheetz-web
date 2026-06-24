import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import RemindersClient from './RemindersClient';

export const dynamic = 'force-dynamic';

export default async function Reminders() {
  await requireHref('/reminders');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Appt Reminders</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const now = new Date();
  const end = new Date(now.getTime() + 2 * 86400000); // next 48h
  const { data: jobs } = await sb.from('jobs')
    .select('id, job_type, scheduled_at, status, tech_name, customers(name, phone, email, sms_consent)')
    .gte('scheduled_at', now.toISOString()).lte('scheduled_at', end.toISOString())
    .order('scheduled_at', { ascending: true }).limit(100);

  const upcoming = (jobs || []).filter((j) => !String(j.status || '').toLowerCase().includes('cancel')).map((j) => ({
    id: j.id, job_type: j.job_type || 'Service', scheduled_at: j.scheduled_at, tech_name: j.tech_name || '',
    customer: (j.customers && j.customers.name) || 'Customer',
    hasPhone: !!(j.customers && j.customers.phone), hasEmail: !!(j.customers && j.customers.email),
    consent: !!(j.customers && j.customers.sms_consent),
  }));

  return (
    <div className="wrap" style={{ maxWidth: 820 }}>
      <div className="h1">Appt Reminders</div>
      <p className="muted">Jobs in the next 48 hours — send a reminder text/email (consent-gated, logged). Nothing auto-sends.</p>
      <RemindersClient jobs={upcoming} />
    </div>
  );
}
