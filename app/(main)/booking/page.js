import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import BookingForm from './BookingForm';

export const dynamic = 'force-dynamic';

export default async function Booking() {
  await requirePerm('createJobs');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Job Booking</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  // Field-assignable roster only — office staff are excluded (set on /team). Graceful pre-migration.
  let tRes = await sb.from('techs').select('id, name, position').neq('position', 'office').order('name');
  if (tRes.error) tRes = await sb.from('techs').select('id, name').order('name');
  const techs = (tRes.data || []).map((t) => ({ id: t.id, name: t.name }));

  return (
    <div className="wrap" style={{ maxWidth: 680 }}>
      <div className="h1">Job Booking</div>
      <p className="muted">Book a job onto the board — search the customer base (13k) or add a new one. Lands as a scheduled job.</p>
      <BookingForm techs={techs} />
    </div>
  );
}
