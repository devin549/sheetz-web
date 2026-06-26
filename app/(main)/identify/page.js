import { requirePerm } from '@/lib/guard';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { canSeeCost } from '@/lib/pricebookEngine';
import IdentifyClient from './IdentifyClient';

export const dynamic = 'force-dynamic';

export default async function Identify() {
  const { profile, role } = await requirePerm('changeStatus', 'seeOwnOnly', 'seeCrew', 'seeAllJobs', 'manageInventory');
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">📸 Identify a Part</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;

  // The tech's active job, so a found fix can drop straight onto it.
  let activeJob = null;
  if (profile.tech_id) {
    try { const { data } = await getSupabaseAdmin().from('jobs').select('id, job_number').eq('tech_id', profile.tech_id).in('status', ['enroute', 'on_site', 'onsite', 'rolling']).order('scheduled_at', { ascending: true }).limit(1).maybeSingle(); activeJob = data || null; } catch (_) {}
  }

  return (
    <div className="wrap" style={{ maxWidth: 620 }}>
      <div className="h1" style={{ marginBottom: 2 }}>📸 Identify a Part</div>
      <p className="muted" style={{ fontSize: 13 }}>Snap an unknown part, cartridge, fixture, or unit — we’ll name it and show the fix from your pricebook. Add it to the job with one tap.</p>
      <IdentifyClient activeJobId={activeJob?.id || ''} activeJobNumber={activeJob?.job_number || ''} showCost={canSeeCost(role)} />
    </div>
  );
}
